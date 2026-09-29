import "server-only";
import type { TransactionClient } from "@dopl/db";
import { canMailbox, ForbiddenError, type MailboxAction } from "@dopl/shared/policy";
import { normalizeEmail, type Address } from "@dopl/shared/domain/mail";
import {
  docToHtml,
  docToPlainText,
  extractMentions,
  sanitizeDoc,
  textToDoc,
} from "@dopl/shared/rich-text";
import {
  AssignThreadSchema,
  CreateMailboxSchema,
  EmailCommentSchema,
  LinkThreadSchema,
  MailboxIdSchema,
  PresenceSchema,
  PromoteThreadSchema,
  ReplySchema,
  SetThreadLabelsSchema,
  SetThreadStatusSchema,
  SnoozeThreadSchema,
  UnlinkThreadSchema,
  UpdateMailboxSchema,
} from "@dopl/shared/schemas/mail";
import { CreateWorkItemSchema } from "@dopl/shared/schemas/work-item";
import { keyAfter } from "@dopl/shared/sort-keys";
import { ConflictError, NotFoundError } from "../action-result";
import { db } from "../db";
import { enqueue } from "../jobs";
import { audit, withMutation, type Mutation } from "../mutation";
import { notify } from "../notifications/notify";
import { projectAccessById } from "../queries/projects";
import { resolveItemRef } from "../queries/work-items";
import { publishEphemeral } from "../realtime/ephemeral";
import type { WorkspaceCtx } from "../session";
import { createOne } from "./work-items";

/* ───────────────────────── access ───────────────────────── */

async function isMember(tx: TransactionClient, mailboxId: string, userId: string) {
  return (await tx.mailboxMember.count({ where: { mailboxId, userId } })) > 0;
}

/** A mailbox the actor may use; one they can't read looks missing. */
async function loadMailbox(
  tx: TransactionClient,
  ctx: WorkspaceCtx,
  id: string,
  action: MailboxAction,
) {
  const mailbox = await tx.mailbox.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null },
  });
  if (!mailbox) throw new NotFoundError();
  const policy = { isMember: await isMember(tx, id, ctx.actor.userId) };
  if (!canMailbox(ctx.policyActor, policy, "mailbox.read")) throw new NotFoundError();
  if (!canMailbox(ctx.policyActor, policy, action)) throw new ForbiddenError();
  return mailbox;
}

async function loadThread(m: Mutation, threadId: string, action: MailboxAction = "mailbox.act") {
  const thread = await m.tx.emailThread.findFirst({
    where: { id: threadId, workspaceId: m.ctx.workspace.id },
  });
  if (!thread) throw new NotFoundError();
  const mailbox = await loadMailbox(m.tx, m.ctx, thread.mailboxId, action);
  return { thread, mailbox };
}

/** People who may read a mailbox: its members and the workspace admins. */
async function readers(tx: TransactionClient, workspaceId: string, mailboxId: string) {
  const [members, admins] = await Promise.all([
    tx.mailboxMember.findMany({ where: { mailboxId }, select: { userId: true } }),
    tx.workspaceMember.findMany({
      where: { workspaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    }),
  ]);
  return new Set([...members, ...admins].map((r) => r.userId));
}

function changed(m: Mutation, thread: { id: string; mailboxId: string }, type: string) {
  m.emit({ topic: `mailbox:${thread.mailboxId}`, type, payload: { id: thread.id } });
  m.emit({ topic: `emailThread:${thread.id}`, type, payload: { id: thread.id } });
}

/* ───────────────────────── mailboxes (admins) ───────────────────────── */

async function validMembers(tx: TransactionClient, ctx: WorkspaceCtx, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await tx.workspaceMember.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      userId: { in: ids },
      status: "ACTIVE",
      role: { not: "GUEST" },
      user: { kind: "HUMAN" },
    },
    select: { userId: true },
  });
  if (rows.length !== new Set(ids).size) throw new ConflictError("invalid_member");
  return rows.map((r) => r.userId);
}

/**
 * Connects a mailbox (ROADMAP §7a.2): the worker tests the delegation token
 * and starts the backfill. Only the address is stored here; the web app never
 * sees Google credentials (D-027).
 */
export async function createMailbox(ctx: WorkspaceCtx, raw: unknown) {
  const input = CreateMailboxSchema.parse(raw);
  if (!canMailbox(ctx.policyActor, { isMember: false }, "mailbox.manage"))
    throw new ForbiddenError();
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    const existing = await tx.mailbox.findFirst({
      where: { workspaceId: ctx.workspace.id, emailAddress: input.emailAddress },
      select: { id: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) throw new ConflictError("mailbox_exists");
    const members = await validMembers(tx, ctx, input.memberIds);
    const [assignee] = input.defaultAssigneeId
      ? await validMembers(tx, ctx, [input.defaultAssigneeId])
      : [null];
    const data = {
      displayName: input.displayName,
      backfillDays: input.backfillDays,
      defaultAssigneeId: assignee ?? null,
      status: "CONNECTING" as const,
      historyId: null,
      backfillPageToken: null,
      syncError: null,
      deletedAt: null,
      createdById: ctx.actor.userId,
    };
    const mailbox = existing
      ? await tx.mailbox.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.mailbox.create({
          data: { workspaceId: ctx.workspace.id, emailAddress: input.emailAddress, ...data },
          select: { id: true },
        });
    await tx.mailboxMember.deleteMany({ where: { mailboxId: mailbox.id } });
    if (members.length)
      await tx.mailboxMember.createMany({
        data: members.map((userId) => ({
          mailboxId: mailbox.id,
          userId,
          workspaceId: ctx.workspace.id,
        })),
      });
    await enqueue(tx, "gmail.test", { mailboxId: mailbox.id });
    await audit(tx, ctx, {
      action: "mailbox.connected",
      targetType: "mailbox",
      targetId: mailbox.id,
      metadata: { emailAddress: input.emailAddress, members: members.length },
    });
    m.activity({ entityType: "MAILBOX", entityId: mailbox.id, verb: "connected" });
    m.emit({
      topic: `workspace:${ctx.workspace.id}`,
      type: "mailbox.created",
      payload: { id: mailbox.id },
    });
    return { id: mailbox.id };
  });
}

export async function updateMailbox(ctx: WorkspaceCtx, raw: unknown) {
  const input = UpdateMailboxSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    const mailbox = await loadMailbox(tx, ctx, input.id, "mailbox.manage");
    const data: Parameters<typeof tx.mailbox.update>[0]["data"] = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.backfillDays !== undefined) data.backfillDays = input.backfillDays;
    if (input.sendEnabled !== undefined) data.sendEnabled = input.sendEnabled;
    if (input.defaultAssigneeId !== undefined) {
      const [a] = input.defaultAssigneeId
        ? await validMembers(tx, ctx, [input.defaultAssigneeId])
        : [];
      data.defaultAssigneeId = a ?? null;
    }
    await tx.mailbox.update({ where: { id: mailbox.id }, data });
    if (input.memberIds) {
      const members = await validMembers(tx, ctx, input.memberIds);
      await tx.mailboxMember.deleteMany({ where: { mailboxId: mailbox.id } });
      if (members.length)
        await tx.mailboxMember.createMany({
          data: members.map((userId) => ({
            mailboxId: mailbox.id,
            userId,
            workspaceId: ctx.workspace.id,
          })),
        });
      m.emit({
        topic: `workspace:${ctx.workspace.id}`,
        type: "mailbox.members",
        payload: { id: mailbox.id },
      });
    }
    await audit(tx, ctx, {
      action: "mailbox.updated",
      targetType: "mailbox",
      targetId: mailbox.id,
      metadata: { fields: [...Object.keys(data), ...(input.memberIds ? ["members"] : [])] },
    });
    m.emit({
      topic: `mailbox:${mailbox.id}`,
      type: "mailbox.updated",
      payload: { id: mailbox.id },
    });
    return { id: mailbox.id };
  });
}

/** Pause, resume (runs the connection test again), or disconnect (stops syncing; mail stays). */
export async function setMailboxState(
  ctx: WorkspaceCtx,
  rawId: unknown,
  action: "pause" | "resume" | "disconnect" | "test",
) {
  const id = MailboxIdSchema.parse(rawId);
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    const mailbox = await loadMailbox(tx, ctx, id, "mailbox.manage");
    if (action === "pause") await tx.mailbox.update({ where: { id }, data: { status: "PAUSED" } });
    if (action === "disconnect")
      await tx.mailbox.update({
        where: { id },
        data: { status: "DISCONNECTED", deletedAt: new Date() },
      });
    if (action === "resume" || action === "test") {
      if (action === "resume")
        await tx.mailbox.update({
          where: { id },
          data: { status: mailbox.historyId ? "ACTIVE" : "CONNECTING" },
        });
      await enqueue(tx, "gmail.test", { mailboxId: id });
    }
    await audit(tx, ctx, { action: `mailbox.${action}`, targetType: "mailbox", targetId: id });
    m.emit({
      topic: `workspace:${ctx.workspace.id}`,
      type: action === "disconnect" ? "mailbox.deleted" : "mailbox.updated",
      payload: { id },
    });
    m.emit({ topic: `mailbox:${id}`, type: "mailbox.updated", payload: { id } });
    return { id };
  });
}

/** "Sync now" on the status page. */
export async function syncMailboxNow(ctx: WorkspaceCtx, rawId: unknown) {
  const id = MailboxIdSchema.parse(rawId);
  return withMutation(ctx, async (m) => {
    await loadMailbox(m.tx, ctx, id, "mailbox.act");
    await enqueue(m.tx, "gmail.sync", { mailboxId: id, reason: "manual" }, { singletonKey: id });
    return { id };
  });
}

/* ───────────────────────── threads ───────────────────────── */

export async function assignThread(ctx: WorkspaceCtx, raw: unknown) {
  const input = AssignThreadSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { thread, mailbox } = await loadThread(m, input.threadId);
    if (input.assigneeId) {
      const allowed = await readers(m.tx, ctx.workspace.id, mailbox.id);
      if (!allowed.has(input.assigneeId)) throw new ConflictError("assignee_cannot_read");
    }
    if (thread.assigneeId === input.assigneeId) return { id: thread.id };
    await m.tx.emailThread.update({
      where: { id: thread.id },
      data: { assigneeId: input.assigneeId },
    });
    m.activity({
      entityType: "EMAIL_THREAD",
      entityId: thread.id,
      verb: "updated",
      field: "assignee",
      fromValue: thread.assigneeId,
      toValue: input.assigneeId,
    });
    if (input.assigneeId)
      await notify(m, {
        recipientIds: [input.assigneeId],
        type: "EMAIL_ASSIGNED",
        entityType: "EMAIL_THREAD",
        entityId: thread.id,
        emailThreadId: thread.id,
        data: { subject: thread.subject, mailbox: mailbox.emailAddress },
      });
    changed(m, thread, "email.thread.updated");
    return { id: thread.id };
  });
}

export async function setThreadStatus(ctx: WorkspaceCtx, raw: unknown) {
  const input = SetThreadStatusSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { thread } = await loadThread(m, input.threadId);
    if (thread.status === input.status) return { id: thread.id };
    await m.tx.emailThread.update({
      where: { id: thread.id },
      data: {
        status: input.status,
        solvedAt: input.status === "SOLVED" ? new Date() : null,
        ...(input.status !== "OPEN" ? { snoozedUntil: null } : {}),
      },
    });
    m.activity({
      entityType: "EMAIL_THREAD",
      entityId: thread.id,
      verb: "updated",
      field: "status",
      fromValue: thread.status,
      toValue: input.status,
    });
    changed(m, thread, "email.thread.updated");
    return { id: thread.id };
  });
}

export async function snoozeThread(ctx: WorkspaceCtx, raw: unknown) {
  const input = SnoozeThreadSchema.parse(raw);
  const until = input.until ? new Date(input.until) : null;
  if (until && until.getTime() <= Date.now()) throw new ConflictError("snooze_in_past");
  return withMutation(ctx, async (m) => {
    const { thread } = await loadThread(m, input.threadId);
    await m.tx.emailThread.update({ where: { id: thread.id }, data: { snoozedUntil: until } });
    m.activity({
      entityType: "EMAIL_THREAD",
      entityId: thread.id,
      verb: until ? "snoozed" : "unsnoozed",
      toValue: until?.toISOString() ?? null,
    });
    changed(m, thread, "email.thread.updated");
    return { id: thread.id, snoozedUntil: until?.toISOString() ?? null };
  });
}

/** Workspace labels (no project) on a thread; new names are created on the fly. */
export async function setThreadLabels(ctx: WorkspaceCtx, raw: unknown) {
  const input = SetThreadLabelsSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    const { thread } = await loadThread(m, input.threadId);
    const ids = new Set(input.labelIds);
    for (const name of input.create) {
      const existing = await tx.label.findFirst({
        where: {
          workspaceId: ctx.workspace.id,
          projectId: null,
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) ids.add(existing.id);
      else {
        const last = await tx.label.findMany({
          where: { workspaceId: ctx.workspace.id, projectId: null },
          select: { sortKey: true },
        });
        const key =
          last
            .map((l) => l.sortKey)
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
            .at(-1) ?? null;
        const created = await tx.label.create({
          data: {
            workspaceId: ctx.workspace.id,
            projectId: null,
            name,
            color: "grey",
            sortKey: keyAfter(key),
          },
          select: { id: true },
        });
        ids.add(created.id);
      }
    }
    const valid = await tx.label.findMany({
      where: { id: { in: [...ids] }, workspaceId: ctx.workspace.id, projectId: null },
      select: { id: true },
    });
    if (valid.length !== ids.size) throw new ConflictError("invalid_label");
    await tx.emailThreadLabel.deleteMany({ where: { threadId: thread.id } });
    if (valid.length)
      await tx.emailThreadLabel.createMany({
        data: valid.map((l) => ({ threadId: thread.id, labelId: l.id })),
      });
    changed(m, thread, "email.thread.updated");
    return { id: thread.id };
  });
}

/**
 * An internal comment (ARCHITECTURE §9): never sent to the customer.
 * Mentioned teammates who can read the mailbox get EMAIL_MENTION.
 */
export async function addEmailComment(ctx: WorkspaceCtx, raw: unknown) {
  const input = EmailCommentSchema.parse(raw);
  const body = sanitizeDoc(input.body);
  const text = docToPlainText(body);
  if (!text.trim()) throw new ConflictError("empty_comment");
  return withMutation(ctx, async (m) => {
    const { thread, mailbox } = await loadThread(m, input.threadId);
    const comment = await m.tx.emailComment.create({
      data: {
        workspaceId: ctx.workspace.id,
        threadId: thread.id,
        authorId: ctx.actor.userId,
        body: body as object,
        bodyText: text,
      },
      select: { id: true },
    });
    const allowed = await readers(m.tx, ctx.workspace.id, mailbox.id);
    const mentioned = extractMentions(body).filter((id) => allowed.has(id));
    if (mentioned.length)
      await notify(m, {
        recipientIds: mentioned,
        type: "EMAIL_MENTION",
        entityType: "EMAIL_THREAD",
        entityId: thread.id,
        emailThreadId: thread.id,
        data: {
          subject: thread.subject,
          excerpt: text.slice(0, 200),
          mailbox: mailbox.emailAddress,
        },
      });
    m.activity({ entityType: "EMAIL_THREAD", entityId: thread.id, verb: "commented" });
    changed(m, thread, "email.comment.created");
    return { id: comment.id };
  });
}

/* ───────────────────────── work items ───────────────────────── */

/**
 * "Promote to work item" (ROADMAP §7a.5): an item with the latest inbound
 * message as its description (plain text), origin EMAIL and `untrusted`
 * (D-033: the AI teammate treats it as external input), and a CREATED_FROM
 * reference so the thread shows on the item and new replies follow it.
 */
export async function promoteThread(ctx: WorkspaceCtx, raw: unknown) {
  const input = PromoteThreadSchema.parse(raw);
  const project = await projectAccessById(ctx, input.projectId);
  if (!project.can("workItem.create")) throw new ForbiddenError();
  return withMutation(ctx, async (m) => {
    const { thread } = await loadThread(m, input.threadId);
    const latest = await m.tx.emailMessage.findFirst({
      where: { threadId: thread.id, direction: "INBOUND" },
      orderBy: { sentAt: "desc" },
      select: { bodyText: true, fromAddress: true },
    });
    const item = await createOne(
      m,
      project,
      CreateWorkItemSchema.parse({
        projectId: project.project.id,
        title: input.title,
        ...(latest?.bodyText ? { description: textToDoc(latest.bodyText.slice(0, 20_000)) } : {}),
      }),
    );
    await m.tx.workItem.update({
      where: { id: item.id },
      data: { origin: "EMAIL", untrusted: true, createdByContactId: thread.contactId },
    });
    await m.tx.workItemReference.create({
      data: {
        workspaceId: ctx.workspace.id,
        workItemId: item.id,
        kind: "CREATED_FROM",
        sourceType: "EMAIL_THREAD",
        emailThreadId: thread.id,
        createdById: ctx.actor.userId,
      },
    });
    m.activity({
      entityType: "EMAIL_THREAD",
      entityId: thread.id,
      verb: "promoted",
      toValue: item.identifier,
      meta: { workItemId: item.id },
    });
    m.emit({ topic: `workItem:${item.id}`, type: "reference.created", payload: { id: item.id } });
    changed(m, thread, "email.thread.updated");
    return { id: item.id, identifier: item.identifier };
  });
}

/** "Link to existing": a LINKED reference; the thread then shows on the item. */
export async function linkThread(ctx: WorkspaceCtx, raw: unknown) {
  const input = LinkThreadSchema.parse(raw);
  const { id: workItemId, access } = await resolveItemRef(ctx, input.item);
  if (!access.can("workItem.edit")) throw new ForbiddenError();
  return withMutation(ctx, async (m) => {
    const { thread } = await loadThread(m, input.threadId);
    const exists = await m.tx.workItemReference.findUnique({
      where: { workItemId_emailThreadId: { workItemId, emailThreadId: thread.id } },
      select: { id: true },
    });
    if (exists) return { workItemId };
    await m.tx.workItemReference.create({
      data: {
        workspaceId: ctx.workspace.id,
        workItemId,
        kind: "LINKED",
        sourceType: "EMAIL_THREAD",
        emailThreadId: thread.id,
        createdById: ctx.actor.userId,
      },
    });
    m.activity({
      entityType: "EMAIL_THREAD",
      entityId: thread.id,
      verb: "linked",
      meta: { workItemId },
    });
    m.emit({
      topic: `workItem:${workItemId}`,
      type: "reference.created",
      payload: { id: workItemId },
    });
    changed(m, thread, "email.thread.updated");
    return { workItemId };
  });
}

export async function unlinkThread(ctx: WorkspaceCtx, raw: unknown) {
  const input = UnlinkThreadSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { thread } = await loadThread(m, input.threadId);
    await m.tx.workItemReference.deleteMany({
      where: { workItemId: input.workItemId, emailThreadId: thread.id, kind: "LINKED" },
    });
    m.emit({
      topic: `workItem:${input.workItemId}`,
      type: "reference.created",
      payload: { id: input.workItemId },
    });
    changed(m, thread, "email.thread.updated");
    return { id: thread.id };
  });
}

/* ───────────────────────── presence ───────────────────────── */

/**
 * "Sam is viewing / replying" (collision indicator): an ephemeral heartbeat
 * on the thread's topic, like chat's typing indicator. Never stored.
 */
export async function publishThreadPresence(ctx: WorkspaceCtx, raw: unknown) {
  const input = PresenceSchema.parse(raw);
  const thread = await db.emailThread.findFirst({
    where: { id: input.threadId, workspaceId: ctx.workspace.id },
    select: { id: true, mailboxId: true },
  });
  if (!thread) throw new NotFoundError();
  await loadMailbox(db as unknown as TransactionClient, ctx, thread.mailboxId, "mailbox.read");
  await publishEphemeral({
    workspaceId: ctx.workspace.id,
    topic: `emailThread:${thread.id}`,
    type: "presence",
    payload: { userId: ctx.actor.userId, name: ctx.actor.name, state: input.state },
  });
}

/* ───────────────────────── attachments ───────────────────────── */

export class AttachmentTimeoutError extends Error {}

/**
 * An email attachment for download (D-027): stored bytes when the worker
 * already fetched them; otherwise a fetch job, and a short wait for it.
 */
export async function resolveEmailAttachment(ctx: WorkspaceCtx, rawId: unknown) {
  const id = MailboxIdSchema.parse(rawId);
  const a = await db.emailAttachment.findFirst({
    where: { id, message: { workspaceId: ctx.workspace.id } },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      storageKey: true,
      message: { select: { thread: { select: { mailboxId: true } } } },
    },
  });
  if (!a) throw new NotFoundError();
  await loadMailbox(
    db as unknown as TransactionClient,
    ctx,
    a.message.thread.mailboxId,
    "mailbox.read",
  );
  if (a.storageKey) return { storageKey: a.storageKey, filename: a.filename, mimeType: a.mimeType };
  await db.$transaction((tx) =>
    enqueue(tx, "gmail.fetch-attachment", { attachmentId: a.id }, { singletonKey: a.id }),
  );
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    const row = await db.emailAttachment.findUnique({
      where: { id },
      select: { storageKey: true },
    });
    if (row?.storageKey)
      return { storageKey: row.storageKey, filename: a.filename, mimeType: a.mimeType };
  }
  throw new AttachmentTimeoutError();
}

/* ───────────────────────── replies (Phase 7b) ───────────────────────── */

/** Stored address lists are JSON; read them defensively. */
const asAddresses = (v: unknown): Address[] =>
  Array.isArray(v)
    ? v.filter(
        (a): a is Address => typeof a === "object" && a !== null && typeof a.email === "string",
      )
    : [];

/**
 * A reply from Dopl: stored as an OUTBOUND message (QUEUED) with the
 * threading headers, then sent by the worker (gmail.send) in the same Gmail
 * thread. It goes to the latest inbound message's Reply-To or sender; "reply
 * all" adds everyone else on it except the mailbox itself.
 */
export async function replyToThread(ctx: WorkspaceCtx, raw: unknown) {
  const input = ReplySchema.parse(raw);
  const body = sanitizeDoc(input.body);
  const text = docToPlainText(body);
  if (!text.trim()) throw new ConflictError("empty_reply");
  return withMutation(ctx, async (m) => {
    const { thread, mailbox } = await loadThread(m, input.threadId);
    if (!mailbox.sendEnabled) throw new ConflictError("send_disabled");
    const from = input.from ? normalizeEmail(input.from) : mailbox.emailAddress;
    if (from !== normalizeEmail(mailbox.emailAddress)) throw new ConflictError("invalid_from");
    const last = await m.tx.emailMessage.findFirst({
      where: { threadId: thread.id, direction: "INBOUND" },
      orderBy: { sentAt: "desc" },
      select: {
        fromAddress: true,
        replyTo: true,
        toAddresses: true,
        ccAddresses: true,
        subject: true,
        rfc822MessageId: true,
        references: true,
      },
    });
    if (!last) throw new ConflictError("nothing_to_reply_to");
    const own = normalizeEmail(mailbox.emailAddress);
    const to = [normalizeEmail(last.replyTo ?? last.fromAddress)];
    const cc = input.replyAll
      ? [...asAddresses(last.toAddresses), ...asAddresses(last.ccAddresses)]
          .map((a) => normalizeEmail(a.email))
          .filter((a, i, all) => a !== own && !to.includes(a) && all.indexOf(a) === i)
      : [];
    const domain = own.split("@")[1] ?? "dopl.local";
    const message = await m.tx.emailMessage.create({
      data: {
        workspaceId: ctx.workspace.id,
        mailboxId: mailbox.id,
        threadId: thread.id,
        gmailMessageId: null,
        rfc822MessageId: `<${crypto.randomUUID()}@${domain}>`,
        inReplyTo: last.rfc822MessageId,
        references: [
          ...last.references,
          ...(last.rfc822MessageId ? [last.rfc822MessageId] : []),
        ].slice(-20),
        direction: "OUTBOUND",
        fromAddress: own,
        fromName: mailbox.displayName,
        toAddresses: to.map((email) => ({ email, name: null })),
        ccAddresses: cc.map((email) => ({ email, name: null })),
        subject: /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`,
        snippet: text.slice(0, 200),
        bodyText: text,
        bodyHtmlSanitized: docToHtml(body),
        sentAt: new Date(),
        sentById: ctx.actor.userId,
        outboundStatus: "QUEUED",
      },
      select: { id: true },
    });
    await enqueue(m.tx, "gmail.send", { messageId: message.id });
    m.activity({
      entityType: "EMAIL_THREAD",
      entityId: thread.id,
      verb: "replied",
      meta: { messageId: message.id },
    });
    changed(m, thread, "email.message.created");
    return { id: message.id };
  });
}
