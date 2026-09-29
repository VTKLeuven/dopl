import "server-only";
import { Prisma } from "@dopl/db";
import { hashToken } from "@dopl/shared/crypto";
import { uuidv7 } from "@dopl/shared/ids";
import { docToPlainText, textToDoc } from "@dopl/shared/rich-text";
import {
  buildValuesSchema,
  DEFAULT_MIME_TYPES,
  FieldOptionsSchema,
  FormSettingsSchema,
  MIN_FILL_MS,
  PublicSubmitSchema,
  RATE_LIMITS,
  StatusReplySchema,
  type FormSettings,
} from "@dopl/shared/schemas/intake";
import { PrioritySchema, type Priority } from "@dopl/shared/schemas/work-item";
import { z } from "zod";
import { db } from "../db";
import { queueEmail } from "../email/outbox";
import { env, turnstileEnabled } from "../env";
import {
  createTriageItem,
  issueStatusUrl,
  notifyTriagers,
  STATUS_TOKEN_TTL_MS,
} from "../intake/core";
import { withPublicMutation } from "../mutation";
import { hitRateLimit, keyHash } from "../rate-limit";
import { blobStore } from "../storage";
import { notifyTeamOfReply } from "./intake";

/**
 * The public surface (D-008, D-051): no session, so every function here does
 * its own validation, rate limiting and scoping. Nothing returns internal
 * data; results are small and explicit.
 */
export type PublicResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: 400 | 403 | 404 | 409 | 413 | 415 | 429;
      error: string;
      retryAfterSec?: number;
      fields?: Record<string, string[]>;
    };

const fail = <T>(
  status: 400 | 403 | 404 | 409 | 413 | 415 | 429,
  error: string,
  extra: { retryAfterSec?: number; fields?: Record<string, string[]> } = {},
): PublicResult<T> => ({ ok: false, status, error, ...extra });

export interface RequestMeta {
  ip: string;
  userAgent: string | null;
}

const safeName = (name: string) =>
  name
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "file";

/* ───────────────────────── forms ───────────────────────── */

async function loadLiveForm(slug: string) {
  const form = await db.intakeForm.findFirst({
    where: {
      slug: slug.toLowerCase(),
      isPublished: true,
      archivedAt: null,
      deletedAt: null,
      project: { deletedAt: null, archivedAt: null, intakeEnabled: true },
    },
    select: {
      id: true,
      title: true,
      workspaceId: true,
      settings: true,
      fields: {
        where: { archivedAt: null },
        orderBy: { sortKey: "asc" },
        select: {
          key: true,
          label: true,
          type: true,
          required: true,
          options: true,
          target: true,
        },
      },
      project: {
        select: {
          id: true,
          identifier: true,
          name: true,
          workspace: { select: { name: true } },
        },
      },
    },
  });
  if (!form) return null;
  const parsed = FormSettingsSchema.safeParse(form.settings);
  const settings: FormSettings = parsed.success ? parsed.data : FormSettingsSchema.parse({});
  const fields = form.fields.map((f) => ({
    ...f,
    options: FieldOptionsSchema.catch([]).parse(f.options),
  }));
  return { ...form, settings, fields };
}

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}

/** A dropped submission looks like a success to the sender (honeypot, blocked…). */
const silentlyDropped = <T>(data: T): PublicResult<T> => ({ ok: true, data });

export async function submitPublicForm(
  slug: string,
  raw: unknown,
  meta: RequestMeta,
): Promise<PublicResult<{ number: number | null }>> {
  const parsed = PublicSubmitSchema.safeParse(raw);
  if (!parsed.success)
    return fail(400, "invalid_input", {
      fields: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    });
  const input = parsed.data;
  const form = await loadLiveForm(slug);
  if (!form) return fail(404, "not_found");

  const previous = await db.intakeSubmission.findUnique({
    where: { clientSubmissionId: input.clientSubmissionId },
    select: { formId: true, intakeItem: { select: { number: true } } },
  });
  if (previous) {
    return previous.formId === form.id
      ? { ok: true, data: { number: previous.intakeItem.number } }
      : fail(409, "conflict");
  }

  // Spam signals: bots fill hidden fields and submit instantly.
  const fillMs = Date.now() - input.startedAt;
  if (input.website || fillMs < MIN_FILL_MS) {
    console.info("[intake] dropped submission", {
      form: form.id,
      honeypot: !!input.website,
      fillMs,
    });
    return silentlyDropped({ number: null });
  }

  const ipHash = keyHash(meta.ip);
  const perIp = await hitRateLimit(`form-submit:ip:${ipHash}:${form.id}`, RATE_LIMITS.submitPerIp);
  if (!perIp.ok) return fail(429, "rate_limited", { retryAfterSec: perIp.retryAfterSec });
  const perEmail = await hitRateLimit(
    `form-submit:email:${keyHash(input.email)}`,
    RATE_LIMITS.submitPerEmail,
  );
  if (!perEmail.ok) return fail(429, "rate_limited", { retryAfterSec: perEmail.retryAfterSec });

  const origins = form.settings.allowedEmbedOrigins;
  if (input.embedOrigin && origins.length > 0 && !origins.includes(input.embedOrigin))
    return fail(403, "embed_not_allowed");

  let turnstileVerified = false;
  if (form.settings.turnstileEnabled && turnstileEnabled) {
    turnstileVerified = await verifyTurnstile(input.turnstileToken, meta.ip);
    if (!turnstileVerified) return fail(400, "turnstile_failed");
  }

  const valuesResult = buildValuesSchema(form.fields, form.settings).safeParse(input.values);
  if (!valuesResult.success)
    return fail(400, "invalid_input", {
      fields: z.flattenError(valuesResult.error).fieldErrors as Record<string, string[]>,
    });
  const values = valuesResult.data as Record<string, unknown>;

  const emailNormalized = input.email.trim().toLowerCase();
  const contact = await db.contact.upsert({
    where: { workspaceId_emailNormalized: { workspaceId: form.workspaceId, emailNormalized } },
    create: {
      workspaceId: form.workspaceId,
      email: input.email.trim(),
      emailNormalized,
      name: input.name || null,
      firstSource: "INTAKE_FORM",
      lastSeenAt: new Date(),
    },
    update: { lastSeenAt: new Date(), ...(input.name ? { name: input.name } : {}) },
    select: { id: true, email: true, name: true, blockedAt: true },
  });
  if (contact.blockedAt) return silentlyDropped({ number: null });

  // Map answers onto work-item properties (the rest stays on the submission).
  const byTarget = new Map(form.fields.map((f) => [f.target, f]));
  const valueOf = (target: string) => {
    const f = byTarget.get(target as never);
    return f ? values[f.key] : undefined;
  };
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const firstText = form.fields
    .filter((f) => f.type === "SHORT_TEXT")
    .map((f) => str(values[f.key]))
    .find(Boolean);
  const title = (
    str(valueOf("TITLE")) ||
    firstText ||
    `${form.title} from ${input.name || contact.name || input.email}`
  ).slice(0, 300);
  const descriptionText = str(valueOf("DESCRIPTION"));
  const priorityValue = PrioritySchema.safeParse(valueOf("PRIORITY"));
  const priority: Priority = priorityValue.success
    ? priorityValue.data
    : form.settings.defaults.priority;
  const typeCandidate = str(valueOf("TYPE")) || form.settings.defaults.typeId || null;
  const labelCandidates = [
    ...new Set([
      ...(Array.isArray(valueOf("LABELS")) ? (valueOf("LABELS") as string[]) : []),
      ...form.settings.defaults.labelIds,
    ]),
  ];
  const due = str(valueOf("DUE_DATE"));
  const fileIds = form.fields
    .filter((f) => f.type === "FILE")
    .flatMap((f) => (Array.isArray(values[f.key]) ? (values[f.key] as string[]) : []));
  const uploadPrefix = `${form.workspaceId}/intake/${form.id}/${input.clientSubmissionId}/`;

  try {
    const result = await withPublicMutation(
      form.workspaceId,
      { type: "CONTACT", userId: null, contactId: contact.id },
      async (m) => {
        const { tx } = m;
        const [type, labels] = await Promise.all([
          typeCandidate
            ? tx.workItemType.findFirst({
                where: {
                  id: z.uuid().safeParse(typeCandidate).success ? typeCandidate : undefined,
                  workspaceId: form.workspaceId,
                  archivedAt: null,
                  OR: [{ projectId: form.project.id }, { projectId: null }],
                },
                select: { id: true },
              })
            : null,
          tx.label.findMany({
            where: {
              id: { in: labelCandidates.filter((id) => z.uuid().safeParse(id).success) },
              workspaceId: form.workspaceId,
              OR: [{ projectId: form.project.id }, { projectId: null }],
            },
            select: { id: true },
          }),
        ]);
        const created = await createTriageItem(m, {
          project: form.project,
          title,
          description: descriptionText ? textToDoc(descriptionText) : null,
          priority,
          typeId: type?.id ?? null,
          labelIds: labels.map((l) => l.id),
          dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T00:00:00.000Z`) : null,
          source: "FORM",
          formId: form.id,
          contactId: contact.id,
        });
        await tx.intakeSubmission.create({
          data: {
            workspaceId: form.workspaceId,
            formId: form.id,
            intakeItemId: created.intakeId,
            contactId: contact.id,
            clientSubmissionId: input.clientSubmissionId,
            values: values as Prisma.InputJsonValue,
            fieldSnapshot: form.fields.map((f) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              target: f.target,
              options: f.options,
            })),
            ipHash,
            userAgent: meta.userAgent?.slice(0, 300) ?? null,
            embedOrigin: input.embedOrigin ?? null,
            turnstileVerified,
            spamSignals: { fillMs },
          },
        });
        if (fileIds.length > 0) {
          // Only this submission's own quarantined uploads can be claimed.
          const promoted = await tx.attachment.updateMany({
            where: {
              id: { in: fileIds },
              workspaceId: form.workspaceId,
              status: "QUARANTINED",
              storageKey: { startsWith: uploadPrefix },
              workItemId: null,
            },
            data: {
              status: "READY",
              workItemId: created.workItemId,
              uploadedByContactId: contact.id,
            },
          });
          await tx.workItem.update({
            where: { id: created.workItemId },
            data: { attachmentCount: promoted.count },
          });
        }
        const statusUrl = await issueStatusUrl(tx, {
          workspaceId: form.workspaceId,
          contactId: contact.id,
          intakeItemId: created.intakeId,
        });
        await queueEmail(tx, {
          template: "intake.confirmation",
          to: contact.email,
          workspaceId: form.workspaceId,
          contactId: contact.id,
          data: {
            workspaceName: form.project.workspace.name,
            formTitle: form.title,
            intakeNumber: created.number,
            title,
            statusUrl,
          },
        });
        await notifyTriagers(m, {
          projectId: form.project.id,
          projectIdentifier: form.project.identifier,
          intakeId: created.intakeId,
          workItemId: created.workItemId,
          number: created.number,
          title,
          from: input.name || contact.name || contact.email,
          preferred: form.settings.notifyUserIds,
        });
        return { number: created.number };
      },
    );
    return { ok: true, data: result };
  } catch (err) {
    // Two identical requests raced: the other one won, report its result.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const won = await db.intakeSubmission.findUnique({
        where: { clientSubmissionId: input.clientSubmissionId },
        select: { intakeItem: { select: { number: true } } },
      });
      if (won) return { ok: true, data: { number: won.intakeItem.number } };
    }
    throw err;
  }
}

/** One file for a form that isn't submitted yet: stored, but quarantined until it is. */
export async function uploadPublicFile(
  slug: string,
  args: { clientSubmissionId: string; file: File },
  meta: RequestMeta,
): Promise<PublicResult<{ id: string; filename: string; size: number; mimeType: string }>> {
  const clientSubmissionId = z.uuid().safeParse(args.clientSubmissionId);
  if (!clientSubmissionId.success) return fail(400, "invalid_input");
  const form = await loadLiveForm(slug);
  if (!form) return fail(404, "not_found");
  const fileFields = form.fields.filter((f) => f.type === "FILE").length;
  if (fileFields === 0) return fail(400, "no_file_fields");

  const limit = await hitRateLimit(`form-upload:ip:${keyHash(meta.ip)}`, RATE_LIMITS.uploadPerIp);
  if (!limit.ok) return fail(429, "rate_limited", { retryAfterSec: limit.retryAfterSec });

  const { file } = args;
  if (file.size === 0) return fail(400, "empty_file");
  if (file.size > form.settings.maxFileSizeMb * 1024 * 1024) return fail(413, "too_large");
  const allowed = form.settings.allowedMimeTypes.length
    ? form.settings.allowedMimeTypes
    : DEFAULT_MIME_TYPES;
  const mimeType = file.type || "application/octet-stream";
  if (!allowed.includes(mimeType)) return fail(415, "type_not_allowed");

  const prefix = `${form.workspaceId}/intake/${form.id}/${clientSubmissionId.data}/`;
  const already = await db.attachment.count({
    where: { workspaceId: form.workspaceId, storageKey: { startsWith: prefix } },
  });
  if (already >= form.settings.maxFiles * fileFields) return fail(400, "too_many_files");

  const id = uuidv7();
  const filename = safeName(file.name);
  const key = `${prefix}${id}-${filename}`;
  await blobStore().put(key, Buffer.from(await file.arrayBuffer()), mimeType);
  await db.attachment.create({
    data: {
      id,
      workspaceId: form.workspaceId,
      storageKey: key,
      filename,
      mimeType,
      size: file.size,
      status: "QUARANTINED",
    },
  });
  return { ok: true, data: { id, filename, size: file.size, mimeType } };
}

/* ───────────────────────── status page ───────────────────────── */

/**
 * Resolves a status-page token (only its hash is stored). Valid tokens renew
 * on use; blocked contacts and revoked or expired links resolve to nothing.
 */
export async function resolveStatusToken(token: string) {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const row = await db.contactAccessToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      workspaceId: true,
      contactId: true,
      intakeItemId: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      contact: { select: { blockedAt: true, email: true, name: true } },
    },
  });
  if (!row?.intakeItemId || row.revokedAt || row.expiresAt < new Date() || row.contact.blockedAt)
    return null;
  const hourAgo = Date.now() - 60 * 60 * 1000;
  if (!row.lastUsedAt || row.lastUsedAt.getTime() < hourAgo) {
    await db.contactAccessToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + STATUS_TOKEN_TTL_MS) },
    });
  }
  return {
    workspaceId: row.workspaceId,
    contactId: row.contactId,
    intakeItemId: row.intakeItemId,
    contact: row.contact,
  };
}

export async function uploadStatusFile(
  token: string,
  file: File,
  meta: RequestMeta,
): Promise<PublicResult<{ id: string; filename: string; size: number; mimeType: string }>> {
  const access = await resolveStatusToken(token);
  if (!access) return fail(404, "not_found");
  const limit = await hitRateLimit(`status-upload:ip:${keyHash(meta.ip)}`, RATE_LIMITS.uploadPerIp);
  if (!limit.ok) return fail(429, "rate_limited", { retryAfterSec: limit.retryAfterSec });
  if (file.size === 0) return fail(400, "empty_file");
  if (file.size > 10 * 1024 * 1024) return fail(413, "too_large");
  const mimeType = file.type || "application/octet-stream";
  if (!DEFAULT_MIME_TYPES.includes(mimeType)) return fail(415, "type_not_allowed");
  const id = uuidv7();
  const filename = safeName(file.name);
  const key = `${access.workspaceId}/status/${access.intakeItemId}/${id}-${filename}`;
  await blobStore().put(key, Buffer.from(await file.arrayBuffer()), mimeType);
  await db.attachment.create({
    data: {
      id,
      workspaceId: access.workspaceId,
      storageKey: key,
      filename,
      mimeType,
      size: file.size,
      status: "QUARANTINED",
      uploadedByContactId: access.contactId,
    },
  });
  return { ok: true, data: { id, filename, size: file.size, mimeType } };
}

/** A contact replies from the status page: a PUBLIC comment authored by the contact. */
export async function postStatusReply(
  token: string,
  raw: unknown,
  meta: RequestMeta,
): Promise<PublicResult<{ id: string }>> {
  const access = await resolveStatusToken(token);
  if (!access) return fail(404, "not_found");
  const parsed = StatusReplySchema.safeParse(raw);
  if (!parsed.success) return fail(400, "invalid_input");
  const limit = await hitRateLimit(`status-reply:${keyHash(token)}`, RATE_LIMITS.replyPerToken);
  if (!limit.ok) return fail(429, "rate_limited", { retryAfterSec: limit.retryAfterSec });
  void meta;

  const intake = await db.intakeItem.findUnique({
    where: { id: access.intakeItemId },
    select: {
      id: true,
      projectId: true,
      workItemId: true,
      contactId: true,
      workItem: { select: { deletedAt: true } },
    },
  });
  if (!intake || intake.contactId !== access.contactId || intake.workItem.deletedAt)
    return fail(404, "not_found");

  const body = textToDoc(parsed.data.body);
  const result = await withPublicMutation(
    access.workspaceId,
    { type: "CONTACT", userId: null, contactId: access.contactId },
    async (m) => {
      const { tx } = m;
      const comment = await tx.comment.create({
        data: {
          workspaceId: access.workspaceId,
          projectId: intake.projectId,
          workItemId: intake.workItemId,
          authorContactId: access.contactId,
          visibility: "PUBLIC",
          body: body as unknown as Prisma.InputJsonValue,
          bodyText: docToPlainText(body),
        },
        select: { id: true },
      });
      let attached = 0;
      if (parsed.data.attachmentIds.length) {
        const promoted = await tx.attachment.updateMany({
          where: {
            id: { in: parsed.data.attachmentIds },
            workspaceId: access.workspaceId,
            status: "QUARANTINED",
            uploadedByContactId: access.contactId,
            storageKey: { startsWith: `${access.workspaceId}/status/${intake.id}/` },
          },
          data: { status: "READY", workItemId: intake.workItemId },
        });
        attached = promoted.count;
      }
      await tx.workItem.update({
        where: { id: intake.workItemId },
        data: {
          commentCount: { increment: 1 },
          ...(attached ? { attachmentCount: { increment: attached } } : {}),
        },
      });
      await tx.contact.update({
        where: { id: access.contactId },
        data: { lastSeenAt: new Date() },
      });
      await notifyTeamOfReply(m, {
        intakeId: intake.id,
        workItemId: intake.workItemId,
        projectId: intake.projectId,
        commentId: comment.id,
        from: access.contact.name || access.contact.email,
        excerpt: docToPlainText(body, 200),
      });
      m.activity({
        entityType: "WORK_ITEM",
        entityId: intake.workItemId,
        workItemId: intake.workItemId,
        projectId: intake.projectId,
        verb: "commented",
        meta: { commentId: comment.id },
      });
      m.emit({
        topic: `workItem:${intake.workItemId}`,
        type: "comment.created",
        payload: { id: comment.id },
      });
      m.emit({
        topic: `project:${intake.projectId}`,
        type: "intake.updated",
        payload: { id: intake.id },
      });
      return { id: comment.id };
    },
  );
  return { ok: true, data: result };
}

/** Files on the status page: only what this contact uploaded to this request. */
export async function resolveStatusDownload(token: string, attachmentId: string) {
  const access = await resolveStatusToken(token);
  if (!access || !z.uuid().safeParse(attachmentId).success) return null;
  const intake = await db.intakeItem.findUnique({
    where: { id: access.intakeItemId },
    select: { workItemId: true },
  });
  if (!intake) return null;
  return db.attachment.findFirst({
    where: {
      id: attachmentId,
      workspaceId: access.workspaceId,
      workItemId: intake.workItemId,
      uploadedByContactId: access.contactId,
      status: "READY",
      deletedAt: null,
    },
    select: { storageKey: true, filename: true, mimeType: true },
  });
}
