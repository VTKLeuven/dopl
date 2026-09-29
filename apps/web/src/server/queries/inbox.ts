import "server-only";
import type { Prisma } from "@dopl/db";
import { notificationPath } from "@dopl/shared/domain/notifications";
import {
  DEFAULT_PREFERENCE,
  INBOX_FILTER_KEYS,
  INBOX_FILTERS,
  NOTIFICATION_TYPES,
  filterOfType,
  type InboxFilter,
  type InboxQuery,
  type InboxView,
  type NotificationType,
} from "@dopl/shared/schemas/inbox";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere } from "./projects";

export interface InboxRow {
  id: string;
  type: NotificationType;
  entityType: string;
  entityId: string;
  workItemId: string | null;
  projectId: string | null;
  messageId: string | null;
  actor: {
    id: string;
    name: string;
    image: string | null;
    kind: "HUMAN" | "AGENT" | "SYSTEM";
  } | null;
  data: Record<string, unknown>;
  /** Resolved from the work item: INFRA-42 (or "Intake #7" for requests). */
  identifier: string | null;
  intakeId: string | null;
  projectIdentifier: string | null;
  href: string | null;
  readAt: string | null;
  archivedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
}

export interface InboxPage {
  rows: InboxRow[];
  /** Cursor for the next page, or null at the end. */
  next: string | null;
}

export interface InboxCounts {
  /** Unread in the inbox (not archived, not snoozed): the sidebar badge. */
  unread: number;
  byFilter: Record<InboxFilter, number>;
}

const PAGE = 50;

/** Only rows about things the reader can still see. */
async function visibilityWhere(ctx: WorkspaceCtx): Promise<Prisma.NotificationWhereInput> {
  const projects = await db.project.findMany({
    where: accessibleProjectsWhere(ctx),
    select: { id: true },
  });
  return {
    recipientId: ctx.actor.userId,
    workspaceId: ctx.workspace.id,
    AND: [
      { OR: [{ projectId: null }, { projectId: { in: projects.map((p) => p.id) } }] },
      { OR: [{ workItemId: null }, { workItem: { deletedAt: null } }] },
    ],
  };
}

export function viewWhere(view: InboxView, now: Date): Prisma.NotificationWhereInput {
  const notSnoozed: Prisma.NotificationWhereInput = {
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
  };
  switch (view) {
    case "unread":
      return { archivedAt: null, readAt: null, ...notSnoozed };
    case "all":
      return { archivedAt: null, ...notSnoozed };
    case "snoozed":
      return { archivedAt: null, snoozedUntil: { gt: now } };
    case "archived":
      return { archivedAt: { not: null } };
  }
}

const rowSelect = {
  id: true,
  type: true,
  entityType: true,
  entityId: true,
  workItemId: true,
  projectId: true,
  messageId: true,
  data: true,
  readAt: true,
  archivedAt: true,
  snoozedUntil: true,
  createdAt: true,
  actor: { select: { id: true, name: true, image: true, kind: true } },
  workItem: {
    select: {
      sequence: true,
      project: { select: { identifier: true } },
      intakeItem: { select: { id: true, number: true } },
    },
  },
} satisfies Prisma.NotificationSelect;

export async function listNotifications(ctx: WorkspaceCtx, q: InboxQuery): Promise<InboxPage> {
  const now = new Date();
  const base = await visibilityWhere(ctx);
  const cursor = q.cursor ? q.cursor.split("|") : null;
  const at = cursor?.[0] ? new Date(cursor[0]) : null;
  const rows = await db.notification.findMany({
    where: {
      ...base,
      AND: [
        ...(base.AND as Prisma.NotificationWhereInput[]),
        viewWhere(q.view, now),
        ...(q.filter ? [{ type: { in: [...INBOX_FILTERS[q.filter]] } }] : []),
        ...(at && cursor?.[1]
          ? [
              {
                OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: cursor[1] } }],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE + 1,
    select: rowSelect,
  });
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  return {
    rows: page.map((n) => toRow(ctx.workspace.slug, n)),
    next: rows.length > PAGE && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

function toRow(
  ws: string,
  n: Prisma.NotificationGetPayload<{ select: typeof rowSelect }>,
): InboxRow {
  const data = (
    n.data && typeof n.data === "object" && !Array.isArray(n.data) ? n.data : {}
  ) as Record<string, unknown>;
  const wi = n.workItem;
  const identifier = wi
    ? formatIdentifier(wi.project.identifier, wi.sequence, wi.intakeItem?.number)
    : null;
  const intakeId = n.entityType === "INTAKE_ITEM" ? n.entityId : (wi?.intakeItem?.id ?? null);
  const projectIdentifier =
    wi?.project.identifier ??
    (typeof data.projectIdentifier === "string" ? data.projectIdentifier : null);
  const target = {
    type: n.type,
    entityType: n.entityType,
    entityId: n.entityId,
    workItemId: n.workItemId,
    messageId: n.messageId,
    data,
    // Items still in triage have no number; open them by id.
    identifier: wi?.sequence != null ? identifier : n.workItemId,
    intakeId,
    projectIdentifier,
  };
  return {
    id: n.id,
    type: n.type,
    entityType: n.entityType,
    entityId: n.entityId,
    workItemId: n.workItemId,
    projectId: n.projectId,
    messageId: n.messageId,
    actor: n.actor,
    data,
    identifier,
    intakeId,
    projectIdentifier,
    href: notificationPath(ws, target),
    readAt: n.readAt?.toISOString() ?? null,
    archivedAt: n.archivedAt?.toISOString() ?? null,
    snoozedUntil: n.snoozedUntil?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function inboxCounts(ctx: WorkspaceCtx): Promise<InboxCounts> {
  const base = await visibilityWhere(ctx);
  const groups = await db.notification.groupBy({
    by: ["type"],
    where: {
      ...base,
      AND: [...(base.AND as Prisma.NotificationWhereInput[]), viewWhere("unread", new Date())],
    },
    _count: { _all: true },
  });
  const byFilter = Object.fromEntries(INBOX_FILTER_KEYS.map((k) => [k, 0])) as Record<
    InboxFilter,
    number
  >;
  let unread = 0;
  for (const g of groups) {
    unread += g._count._all;
    byFilter[filterOfType(g.type)] += g._count._all;
  }
  return { unread, byFilter };
}

export type NotificationPreferences = Record<NotificationType, { inApp: boolean; email: boolean }>;

/** Workspace-wide preferences of the actor, with defaults filled in. */
export async function getNotificationPreferences(
  ctx: WorkspaceCtx,
): Promise<NotificationPreferences> {
  const rows = await db.notificationPreference.findMany({
    where: { userId: ctx.actor.userId, workspaceId: ctx.workspace.id, projectId: null },
    select: { type: true, inApp: true, email: true },
  });
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => {
      const row = rows.find((r) => r.type === type);
      return [type, row ? { inApp: row.inApp, email: row.email } : { ...DEFAULT_PREFERENCE }];
    }),
  ) as NotificationPreferences;
}
