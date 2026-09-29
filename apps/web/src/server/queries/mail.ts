import "server-only";
import type { Prisma } from "@dopl/db";
import { canMailbox } from "@dopl/shared/policy";
import { ThreadQuerySchema, type MailView } from "@dopl/shared/schemas/mail";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import type {
  MailboxAdmin,
  MailboxSummary,
  Person,
  ThreadDetail,
  ThreadPage,
  ThreadRow,
} from "@/features/mail/types";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere } from "./projects";

const isAdmin = (ctx: WorkspaceCtx) => ctx.role === "OWNER" || ctx.role === "ADMIN";

/** Mailboxes the reader may open (canMailbox "mailbox.read"). */
export async function readableMailboxIds(ctx: WorkspaceCtx): Promise<string[]> {
  if (!canMailbox(ctx.policyActor, { isMember: true }, "mailbox.read")) return [];
  const rows = await db.mailbox.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      deletedAt: null,
      ...(isAdmin(ctx) ? {} : { members: { some: { userId: ctx.actor.userId } } }),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Snoozed threads leave every view but "Snoozed" until they wake. */
function viewWhere(ctx: WorkspaceCtx, view: MailView, now: Date): Prisma.EmailThreadWhereInput {
  const awake: Prisma.EmailThreadWhereInput = {
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
  };
  switch (view) {
    case "unassigned":
      return { status: "OPEN", assigneeId: null, ...awake };
    case "mine":
      return { status: "OPEN", assigneeId: ctx.actor.userId, ...awake };
    case "open":
      return { status: "OPEN", ...awake };
    case "snoozed":
      return { snoozedUntil: { gt: now } };
    case "solved":
      return { status: "SOLVED" };
    case "all":
      return {};
  }
}

export async function listMailboxes(ctx: WorkspaceCtx): Promise<MailboxSummary[]> {
  const ids = await readableMailboxIds(ctx);
  if (ids.length === 0) return [];
  const now = new Date();
  const rows = await db.mailbox.findMany({
    where: { id: { in: ids } },
    orderBy: { emailAddress: "asc" },
    select: { id: true, emailAddress: true, displayName: true, status: true },
  });
  return Promise.all(
    rows.map(async (m) => {
      const [unassigned, mine, open] = await Promise.all(
        (["unassigned", "mine", "open"] as const).map((v) =>
          db.emailThread.count({ where: { mailboxId: m.id, ...viewWhere(ctx, v, now) } }),
        ),
      );
      return { ...m, counts: { unassigned: unassigned ?? 0, mine: mine ?? 0, open: open ?? 0 } };
    }),
  );
}

const rowSelect = {
  id: true,
  mailboxId: true,
  subject: true,
  snippet: true,
  status: true,
  lastMessageAt: true,
  messageCount: true,
  hasAttachments: true,
  unreadInGmail: true,
  snoozedUntil: true,
  participants: true,
  assignee: { select: { id: true, name: true, image: true } },
  contact: { select: { name: true, email: true } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
  _count: { select: { references: true } },
} satisfies Prisma.EmailThreadSelect;
type RowSelected = Prisma.EmailThreadGetPayload<{ select: typeof rowSelect }>;

function toRow(t: RowSelected): ThreadRow {
  const first = (t.participants as Array<{ email: string; name: string | null }>)[0];
  return {
    id: t.id,
    mailboxId: t.mailboxId,
    subject: t.subject,
    snippet: t.snippet,
    status: t.status,
    lastMessageAt: t.lastMessageAt.toISOString(),
    messageCount: t.messageCount,
    hasAttachments: t.hasAttachments,
    unread: t.unreadInGmail,
    snoozedUntil: t.snoozedUntil?.toISOString() ?? null,
    assignee: t.assignee,
    correspondent: t.contact
      ? { name: t.contact.name, email: t.contact.email }
      : first
        ? { name: first.name, email: first.email }
        : null,
    labels: t.labels.map((l) => l.label),
    linkedItems: t._count.references,
  };
}

/** A page of threads, newest activity first (keyset on lastMessageAt, id). */
export async function listThreads(ctx: WorkspaceCtx, raw: unknown): Promise<ThreadPage> {
  const q = ThreadQuerySchema.parse(raw);
  const readable = await readableMailboxIds(ctx);
  const mailboxIds = q.mailboxId ? readable.filter((id) => id === q.mailboxId) : readable;
  if (mailboxIds.length === 0) return { rows: [], nextCursor: null };
  const now = new Date();
  const and: Prisma.EmailThreadWhereInput[] = [
    { mailboxId: { in: mailboxIds } },
    viewWhere(ctx, q.view, now),
  ];
  if (q.q)
    and.push({
      OR: [
        { subject: { contains: q.q, mode: "insensitive" } },
        { snippet: { contains: q.q, mode: "insensitive" } },
        { contact: { email: { contains: q.q, mode: "insensitive" } } },
        { contact: { name: { contains: q.q, mode: "insensitive" } } },
      ],
    });
  if (q.cursor) {
    const [at, id] = q.cursor.split("|");
    const when = new Date(at ?? "");
    if (id && !Number.isNaN(when.getTime()))
      and.push({ OR: [{ lastMessageAt: { lt: when } }, { lastMessageAt: when, id: { lt: id } }] });
  }
  const rows = await db.emailThread.findMany({
    where: { AND: and },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    select: rowSelect,
  });
  const page = rows.slice(0, q.limit).map(toRow);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor: rows.length > q.limit && last ? `${last.lastMessageAt}|${last.id}` : null,
  };
}

async function mailboxReaders(ctx: WorkspaceCtx, mailboxId: string): Promise<Person[]> {
  const users = await db.user.findMany({
    where: {
      kind: "HUMAN",
      OR: [
        { mailboxMemberships: { some: { mailboxId } } },
        {
          memberships: {
            some: {
              workspaceId: ctx.workspace.id,
              status: "ACTIVE",
              role: { in: ["OWNER", "ADMIN"] },
            },
          },
        },
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, image: true },
  });
  return users;
}

export async function getThread(ctx: WorkspaceCtx, id: string): Promise<ThreadDetail> {
  const readable = await readableMailboxIds(ctx);
  const t = await db.emailThread.findFirst({
    where: { id, workspaceId: ctx.workspace.id, mailboxId: { in: readable } },
    select: {
      ...rowSelect,
      mailbox: { select: { id: true, emailAddress: true, displayName: true, sendEnabled: true } },
      messages: {
        orderBy: { sentAt: "asc" },
        select: {
          id: true,
          direction: true,
          fromAddress: true,
          fromName: true,
          toAddresses: true,
          ccAddresses: true,
          subject: true,
          sentAt: true,
          bodyText: true,
          bodyHtmlSanitized: true,
          hasRemoteImages: true,
          outboundStatus: true,
          outboundError: true,
          sentBy: { select: { id: true, name: true, image: true } },
          attachments: {
            select: { id: true, filename: true, mimeType: true, size: true, isInline: true },
          },
        },
      },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true, image: true } },
        },
      },
      references: {
        where: { workItem: { deletedAt: null, project: accessibleProjectsWhere(ctx) } },
        select: {
          kind: true,
          workItem: {
            select: {
              id: true,
              sequence: true,
              title: true,
              stateGroup: true,
              project: { select: { identifier: true } },
            },
          },
        },
      },
    },
  });
  if (!t) throw new NotFoundError();
  const isMember =
    (await db.mailboxMember.count({
      where: { mailboxId: t.mailboxId, userId: ctx.actor.userId },
    })) > 0;
  return {
    ...toRow(t),
    mailbox: t.mailbox,
    messages: t.messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      from: { email: m.fromAddress, name: m.fromName },
      to: m.toAddresses as Array<{ email: string; name: string | null }>,
      cc: m.ccAddresses as Array<{ email: string; name: string | null }>,
      subject: m.subject,
      sentAt: m.sentAt.toISOString(),
      text: m.bodyText,
      html: m.bodyHtmlSanitized,
      hasRemoteImages: m.hasRemoteImages,
      attachments: m.attachments,
      outboundStatus: m.outboundStatus,
      outboundError: m.outboundError,
      sentBy: m.sentBy,
    })),
    comments: t.comments.map((c) => ({
      id: c.id,
      author: c.author,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
    items: t.references.flatMap((r) =>
      r.workItem && r.workItem.sequence !== null
        ? [
            {
              id: r.workItem.id,
              identifier: formatIdentifier(r.workItem.project.identifier, r.workItem.sequence),
              title: r.workItem.title,
              stateGroup: r.workItem.stateGroup,
              kind: r.kind,
            },
          ]
        : [],
    ),
    assignable: await mailboxReaders(ctx, t.mailboxId),
    canAct: canMailbox(ctx.policyActor, { isMember }, "mailbox.act"),
  };
}

/** The mailbox's settings and status page (admins). */
export async function getMailboxAdmin(ctx: WorkspaceCtx, id: string): Promise<MailboxAdmin> {
  if (!canMailbox(ctx.policyActor, { isMember: false }, "mailbox.manage"))
    throw new NotFoundError();
  const m = await db.mailbox.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null },
    select: {
      id: true,
      emailAddress: true,
      displayName: true,
      status: true,
      backfillDays: true,
      backfillCompletedAt: true,
      lastSyncedAt: true,
      watchExpiresAt: true,
      syncError: true,
      syncErrorAt: true,
      sendEnabled: true,
      defaultAssigneeId: true,
      members: { select: { user: { select: { id: true, name: true, image: true } } } },
      syncLogs: {
        orderBy: { startedAt: "desc" },
        take: 20,
        select: {
          id: true,
          kind: true,
          stats: true,
          error: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });
  if (!m) throw new NotFoundError();
  const [summary] = await listMailboxes(ctx).then((all) => all.filter((x) => x.id === id));
  return {
    id: m.id,
    emailAddress: m.emailAddress,
    displayName: m.displayName,
    status: m.status,
    counts: summary?.counts ?? { unassigned: 0, mine: 0, open: 0 },
    backfillDays: m.backfillDays,
    backfillCompletedAt: m.backfillCompletedAt?.toISOString() ?? null,
    lastSyncedAt: m.lastSyncedAt?.toISOString() ?? null,
    watchExpiresAt: m.watchExpiresAt?.toISOString() ?? null,
    syncError: m.syncError,
    syncErrorAt: m.syncErrorAt?.toISOString() ?? null,
    sendEnabled: m.sendEnabled,
    defaultAssigneeId: m.defaultAssigneeId,
    members: m.members.map((x) => x.user),
    logs: m.syncLogs.map((l) => ({
      id: l.id,
      kind: l.kind,
      stats: (l.stats ?? {}) as Record<string, unknown>,
      error: l.error,
      startedAt: l.startedAt.toISOString(),
      finishedAt: l.finishedAt?.toISOString() ?? null,
    })),
  };
}

/** Admin list for Settings → Mailboxes (all connected mailboxes). */
export async function listMailboxesForAdmin(ctx: WorkspaceCtx) {
  if (!canMailbox(ctx.policyActor, { isMember: false }, "mailbox.manage")) return [];
  return db.mailbox.findMany({
    where: { workspaceId: ctx.workspace.id, deletedAt: null },
    orderBy: { emailAddress: "asc" },
    select: {
      id: true,
      emailAddress: true,
      displayName: true,
      status: true,
      lastSyncedAt: true,
      syncError: true,
      _count: { select: { members: true, threads: true } },
    },
  });
}
