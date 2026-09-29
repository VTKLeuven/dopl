import "server-only";
import type { Prisma } from "@dopl/db";
import { canSeeRequest, ForbiddenError } from "@dopl/shared/policy";
import {
  FieldOptionsSchema,
  FormSettingsSchema,
  FormThemeSchema,
  publicStatus,
  type FieldOption,
  type IntakeTab,
  type PublicStatus,
} from "@dopl/shared/schemas/intake";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { docToPlainText, type PMNode } from "@dopl/shared/rich-text";
import { z } from "zod";
import type { RequestInfo } from "@/features/work-items/types";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere, projectAccessById, type ProjectAccess } from "./projects";

/* ───────────────────────── triage queue ───────────────────────── */

export interface IntakeRow {
  id: string;
  number: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "DUPLICATE";
  source: "IN_APP" | "FORM" | "EMAIL" | "API";
  workItemId: string;
  title: string;
  priority: string;
  commentCount: number;
  attachmentCount: number;
  createdAt: string;
  snoozedUntil: string | null;
  triagedAt: string | null;
  triagedByName: string | null;
  /** INFRA-42 once accepted. */
  identifier: string | null;
  duplicateOf: string | null;
  declineReason: string | null;
  submitter: { kind: "contact" | "user"; name: string; email: string } | null;
  formTitle: string | null;
}

export type IntakeCounts = Record<IntakeTab, number>;

function tabWhere(tab: IntakeTab, now: Date): Prisma.IntakeItemWhereInput {
  switch (tab) {
    case "pending":
      return { status: "PENDING", OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };
    case "snoozed":
      return { status: "PENDING", snoozedUntil: { gt: now } };
    case "accepted":
      return { status: "ACCEPTED" };
    case "declined":
      return { status: "DECLINED" };
    case "duplicate":
      return { status: "DUPLICATE" };
  }
}

export function assertTriage(access: ProjectAccess) {
  if (!access.can("intake.triage")) throw new ForbiddenError();
}

export async function listIntake(access: ProjectAccess, tab: IntakeTab): Promise<IntakeRow[]> {
  assertTriage(access);
  const rows = await db.intakeItem.findMany({
    where: {
      projectId: access.project.id,
      workItem: { deletedAt: null },
      ...tabWhere(tab, new Date()),
    },
    orderBy: tab === "snoozed" ? { snoozedUntil: "asc" } : { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      number: true,
      status: true,
      source: true,
      createdAt: true,
      snoozedUntil: true,
      triagedAt: true,
      declineReason: true,
      triagedBy: { select: { name: true } },
      contact: { select: { name: true, email: true } },
      submitterUser: { select: { name: true, email: true } },
      form: { select: { title: true } },
      duplicateOf: { select: { sequence: true, project: { select: { identifier: true } } } },
      workItem: {
        select: {
          id: true,
          title: true,
          priority: true,
          sequence: true,
          commentCount: true,
          attachmentCount: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    source: r.source,
    workItemId: r.workItem.id,
    title: r.workItem.title,
    priority: r.workItem.priority,
    commentCount: r.workItem.commentCount,
    attachmentCount: r.workItem.attachmentCount,
    createdAt: r.createdAt.toISOString(),
    snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
    triagedAt: r.triagedAt?.toISOString() ?? null,
    triagedByName: r.triagedBy?.name ?? null,
    identifier:
      r.workItem.sequence != null
        ? formatIdentifier(access.project.identifier, r.workItem.sequence)
        : null,
    duplicateOf: r.duplicateOf
      ? formatIdentifier(r.duplicateOf.project.identifier, r.duplicateOf.sequence)
      : null,
    declineReason: r.declineReason,
    submitter: r.contact
      ? { kind: "contact", name: r.contact.name ?? r.contact.email, email: r.contact.email }
      : r.submitterUser
        ? { kind: "user", name: r.submitterUser.name, email: r.submitterUser.email }
        : null,
    formTitle: r.form?.title ?? null,
  }));
}

export async function countIntake(access: ProjectAccess): Promise<IntakeCounts> {
  const now = new Date();
  const base = { projectId: access.project.id, workItem: { deletedAt: null } };
  const [grouped, snoozed] = await Promise.all([
    db.intakeItem.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    db.intakeItem.count({ where: { ...base, ...tabWhere("snoozed", now) } }),
  ]);
  const by = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  return {
    pending: by("PENDING") - snoozed,
    snoozed,
    accepted: by("ACCEPTED"),
    declined: by("DECLINED"),
    duplicate: by("DUPLICATE"),
  };
}

/** Pending counts for the sidebar badge, per accessible project where the actor triages. */
export async function pendingIntakeByProject(ctx: WorkspaceCtx): Promise<Record<string, number>> {
  if (ctx.role === "GUEST") return {};
  const now = new Date();
  const rows = await db.intakeItem.groupBy({
    by: ["projectId"],
    where: {
      workspaceId: ctx.workspace.id,
      status: "PENDING",
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      workItem: { deletedAt: null },
      project: { ...accessibleProjectsWhere(ctx), archivedAt: null },
    },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.projectId, r._count._all]));
}

/* ───────────────────────── request details ───────────────────────── */

export interface RequestAnswer {
  key: string;
  label: string;
  type: string;
  value: string | string[] | boolean | null;
}

export type { RequestInfo };

const SnapshotSchema = z.array(
  z.object({
    key: z.string(),
    label: z.string(),
    type: z.string(),
    options: FieldOptionsSchema.catch([]).default([]),
  }),
);

/** Form answers in form order, with option values turned back into labels. */
export function readAnswers(snapshot: unknown, values: unknown): RequestAnswer[] {
  const fields = SnapshotSchema.catch([]).parse(snapshot);
  const v = (values ?? {}) as Record<string, unknown>;
  const label = (opts: FieldOption[], value: unknown) =>
    opts.find((o) => o.value === value)?.label ?? String(value);
  return fields
    .filter((f) => f.type !== "FILE")
    .map((f) => {
      const raw = v[f.key];
      let value: RequestAnswer["value"] = null;
      if (f.type === "MULTI_SELECT" && Array.isArray(raw))
        value = raw.map((x) => label(f.options, x));
      else if (f.type === "SELECT" && typeof raw === "string" && raw) value = label(f.options, raw);
      else if (f.type === "CHECKBOX") value = raw === true;
      else if (typeof raw === "string" && raw) value = raw;
      return { key: f.key, label: f.label, type: f.type, value };
    });
}

export const requestSelect = {
  id: true,
  number: true,
  status: true,
  source: true,
  snoozedUntil: true,
  declineReason: true,
  triagedAt: true,
  triagedBy: { select: { name: true } },
  contact: { select: { id: true, name: true, email: true } },
  submitterUser: { select: { id: true, name: true, email: true } },
  form: { select: { id: true, title: true } },
  submission: { select: { values: true, fieldSnapshot: true } },
  duplicateOf: {
    select: { sequence: true, title: true, project: { select: { identifier: true } } },
  },
} satisfies Prisma.IntakeItemSelect;

type RequestRecord = Prisma.IntakeItemGetPayload<{ select: typeof requestSelect }>;

export function toRequestInfo(r: RequestRecord, stateGroup: string): RequestInfo {
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    source: r.source,
    snoozedUntil: r.snoozedUntil?.toISOString() ?? null,
    declineReason: r.declineReason,
    triagedAt: r.triagedAt?.toISOString() ?? null,
    triagedByName: r.triagedBy?.name ?? null,
    duplicateOf: r.duplicateOf
      ? {
          identifier: formatIdentifier(r.duplicateOf.project.identifier, r.duplicateOf.sequence),
          title: r.duplicateOf.title,
        }
      : null,
    submitter: r.contact
      ? {
          kind: "contact",
          id: r.contact.id,
          name: r.contact.name ?? r.contact.email,
          email: r.contact.email,
        }
      : r.submitterUser
        ? {
            kind: "user",
            id: r.submitterUser.id,
            name: r.submitterUser.name,
            email: r.submitterUser.email,
          }
        : null,
    form: r.form,
    answers: r.submission ? readAnswers(r.submission.fieldSnapshot, r.submission.values) : [],
    publicStatus: publicStatus(r.status, stateGroup),
  };
}

/* ───────────────────────── guests: my requests ───────────────────────── */

export interface MyRequestRow {
  id: string;
  number: number;
  title: string;
  project: { identifier: string; name: string; color: string | null };
  status: PublicStatus;
  createdAt: string;
  updatedAt: string;
  publicCommentCount: number;
}

/** The actor's own in-app requests, across the projects they can still see. */
export async function listMyRequests(ctx: WorkspaceCtx): Promise<MyRequestRow[]> {
  const rows = await db.intakeItem.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      submitterUserId: ctx.actor.userId,
      workItem: { deletedAt: null },
      project: accessibleProjectsWhere(ctx),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      project: { select: { identifier: true, name: true, color: true } },
      workItem: {
        select: {
          title: true,
          stateGroup: true,
          updatedAt: true,
          _count: { select: { comments: { where: { visibility: "PUBLIC", deletedAt: null } } } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.workItem.title,
    project: r.project,
    status: publicStatus(r.status, r.workItem.stateGroup),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.workItem.updatedAt.toISOString(),
    publicCommentCount: r.workItem._count.comments,
  }));
}

/** Projects where the actor may submit a request (the "New request" picker). */
export async function listRequestProjects(ctx: WorkspaceCtx) {
  const projects = await db.project.findMany({
    where: { ...accessibleProjectsWhere(ctx), archivedAt: null, intakeEnabled: true },
    select: { id: true, identifier: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
  return projects;
}

export interface PublicComment {
  id: string;
  /** "team" for members, "you" for the submitter viewing their own request. */
  author: { name: string; mine: boolean; team: boolean };
  body: unknown;
  createdAt: string;
}

/**
 * What a submitter may see about a request (ARCHITECTURE §7): an explicit
 * allowlist, not "the item minus some fields". PUBLIC comments only, no
 * internal state names, no activity, no other people's emails.
 */
export interface PublicRequestView {
  id: string;
  number: number;
  title: string;
  description: unknown;
  status: PublicStatus;
  createdAt: string;
  workspaceName: string;
  projectName: string;
  formTitle: string | null;
  declineReason: string | null;
  answers: RequestAnswer[];
  files: Array<{ id: string; filename: string; size: number; mimeType: string }>;
  comments: PublicComment[];
}

export async function buildPublicRequestView(
  intakeId: string,
  viewer: { userId?: string; contactId?: string },
): Promise<PublicRequestView> {
  const r = await db.intakeItem.findUniqueOrThrow({
    where: { id: intakeId },
    select: {
      ...requestSelect,
      createdAt: true,
      project: { select: { name: true, workspace: { select: { name: true } } } },
      workItem: {
        select: {
          id: true,
          title: true,
          description: true,
          stateGroup: true,
          attachments: {
            where: {
              status: "READY",
              deletedAt: null,
              ...(viewer.contactId
                ? { uploadedByContactId: viewer.contactId }
                : { uploadedById: viewer.userId ?? "00000000-0000-0000-0000-000000000000" }),
            },
            orderBy: { createdAt: "asc" },
            select: { id: true, filename: true, size: true, mimeType: true },
          },
          comments: {
            where: { visibility: "PUBLIC", deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              body: true,
              createdAt: true,
              authorId: true,
              authorContactId: true,
              author: { select: { name: true } },
              authorContact: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  const info = toRequestInfo(r, r.workItem.stateGroup);
  return {
    id: r.id,
    number: r.number,
    title: r.workItem.title,
    description: r.workItem.description,
    status: info.publicStatus,
    createdAt: r.createdAt.toISOString(),
    workspaceName: r.project.workspace.name,
    projectName: r.project.name,
    formTitle: r.form?.title ?? null,
    declineReason: r.status === "DECLINED" ? r.declineReason : null,
    answers: info.answers,
    files: r.workItem.attachments,
    comments: r.workItem.comments.map((c) => {
      const mine =
        (viewer.userId && c.authorId === viewer.userId) ||
        (viewer.contactId && c.authorContactId === viewer.contactId);
      return {
        id: c.id,
        author: {
          name: c.author?.name ?? c.authorContact?.name ?? c.authorContact?.email ?? "",
          mine: Boolean(mine),
          team: Boolean(c.authorId) && !mine,
        },
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      };
    }),
  };
}

/** A guest's (or any submitter's) own request, through the same allowlist. */
export async function getMyRequest(ctx: WorkspaceCtx, intakeId: string) {
  if (!z.uuid().safeParse(intakeId).success) throw new NotFoundError();
  const intake = await db.intakeItem.findFirst({
    where: { id: intakeId, workspaceId: ctx.workspace.id, workItem: { deletedAt: null } },
    select: { id: true, projectId: true, submitterUserId: true },
  });
  if (!intake) throw new NotFoundError();
  const access = await projectAccessById(ctx, intake.projectId);
  if (
    intake.submitterUserId !== ctx.actor.userId ||
    !canSeeRequest(ctx.policyActor, access.policy, intake)
  )
    throw new NotFoundError();
  return buildPublicRequestView(intake.id, { userId: ctx.actor.userId });
}

/* ───────────────────────── forms (builder + settings) ───────────────────────── */

export async function listForms(access: ProjectAccess) {
  const forms = await db.intakeForm.findMany({
    where: { projectId: access.project.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      isPublished: true,
      updatedAt: true,
      _count: { select: { submissions: true } },
    },
  });
  return forms.map((f) => ({
    id: f.id,
    slug: f.slug,
    title: f.title,
    isPublished: f.isPublished,
    updatedAt: f.updatedAt.toISOString(),
    submissions: f._count.submissions,
  }));
}
export type FormListItem = Awaited<ReturnType<typeof listForms>>[number];

export async function getFormForEdit(access: ProjectAccess, formId: string) {
  if (!access.can("project.manage")) throw new ForbiddenError();
  if (!z.uuid().safeParse(formId).success) throw new NotFoundError();
  const form = await db.intakeForm.findFirst({
    where: { id: formId, projectId: access.project.id, deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      isPublished: true,
      settings: true,
      theme: true,
      fields: {
        where: { archivedAt: null },
        orderBy: { sortKey: "asc" },
        select: {
          key: true,
          label: true,
          type: true,
          required: true,
          helpText: true,
          placeholder: true,
          options: true,
          target: true,
        },
      },
    },
  });
  if (!form) throw new NotFoundError();
  return {
    id: form.id,
    slug: form.slug,
    title: form.title,
    description: docToPlainText(form.description as PMNode | null),
    isPublished: form.isPublished,
    settings: FormSettingsSchema.catch(FormSettingsSchema.parse({})).parse(form.settings),
    theme: FormThemeSchema.catch(FormThemeSchema.parse({})).parse(form.theme),
    fields: form.fields.map((f) => ({
      ...f,
      options: FieldOptionsSchema.catch([]).parse(f.options),
    })),
  };
}
export type FormForEdit = Awaited<ReturnType<typeof getFormForEdit>>;
