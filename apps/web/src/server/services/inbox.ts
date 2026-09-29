import "server-only";
import type { Prisma, TransactionClient } from "@dopl/db";
import {
  INBOX_FILTERS,
  InboxBulkSchema,
  InboxSnoozeSchema,
  MarkAllReadSchema,
  NotificationPreferenceSchema,
} from "@dopl/shared/schemas/inbox";
import { ConflictError } from "../action-result";
import { withMutation, type BaseMutation } from "../mutation";
import { viewWhere } from "../queries/inbox";
import type { WorkspaceCtx } from "../session";

/*
 * Inbox state is personal (read, archived, snoozed), like view preferences:
 * no Activity rows, but every change emits `notification.updated` on the
 * owner's user topic so badges and lists in other tabs follow.
 */

function emitUpdated(m: BaseMutation, userId: string, ids: string[] | "all") {
  m.emit({
    topic: `user:${userId}`,
    type: "notification.updated",
    payload: ids === "all" ? { all: true } : { ids: ids.slice(0, 100) },
  });
}

export async function updateNotifications(ctx: WorkspaceCtx, raw: unknown) {
  const input = InboxBulkSchema.parse(raw);
  const now = new Date();
  const data: Prisma.NotificationUpdateManyMutationInput =
    input.action === "read"
      ? { readAt: now }
      : input.action === "unread"
        ? { readAt: null }
        : input.action === "archive"
          ? { archivedAt: now, snoozedUntil: null }
          : { archivedAt: null };
  return withMutation(ctx, async (m) => {
    const res = await m.tx.notification.updateMany({
      where: {
        id: { in: input.ids },
        recipientId: ctx.actor.userId,
        workspaceId: ctx.workspace.id,
        // Don't move the read time of rows that were already read.
        ...(input.action === "read" ? { readAt: null } : {}),
      },
      data,
    });
    if (res.count > 0) emitUpdated(m, ctx.actor.userId, input.ids);
    return { updated: res.count };
  });
}

export async function snoozeNotifications(ctx: WorkspaceCtx, raw: unknown) {
  const input = InboxSnoozeSchema.parse(raw);
  const until = input.until ? new Date(input.until) : null;
  if (until && until.getTime() <= Date.now()) throw new ConflictError("snooze_in_past");
  return withMutation(ctx, async (m) => {
    const res = await m.tx.notification.updateMany({
      where: {
        id: { in: input.ids },
        recipientId: ctx.actor.userId,
        workspaceId: ctx.workspace.id,
      },
      // Snoozing takes it out of the inbox; it comes back unread.
      data: until
        ? { snoozedUntil: until, readAt: null, archivedAt: null }
        : { snoozedUntil: null },
    });
    if (res.count > 0) emitUpdated(m, ctx.actor.userId, input.ids);
    return { updated: res.count };
  });
}

export async function markAllRead(ctx: WorkspaceCtx, raw: unknown) {
  const input = MarkAllReadSchema.parse(raw ?? {});
  return withMutation(ctx, async (m) => {
    const res = await m.tx.notification.updateMany({
      where: {
        recipientId: ctx.actor.userId,
        workspaceId: ctx.workspace.id,
        ...viewWhere("unread", new Date()),
        ...(input.filter ? { type: { in: [...INBOX_FILTERS[input.filter]] } } : {}),
      },
      data: { readAt: new Date() },
    });
    if (res.count > 0) emitUpdated(m, ctx.actor.userId, "all");
    return { updated: res.count };
  });
}

/**
 * Reading a conversation reads its notifications: opening a channel marks
 * the mentions in it as read, opening a thread its replies (Messages).
 */
export async function readNotificationsWhere(
  m: BaseMutation,
  userId: string,
  where: Prisma.NotificationWhereInput,
): Promise<number> {
  const res = await m.tx.notification.updateMany({
    where: { ...where, recipientId: userId, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });
  if (res.count > 0) emitUpdated(m, userId, "all");
  return res.count;
}

export async function setNotificationPreference(ctx: WorkspaceCtx, raw: unknown) {
  const input = NotificationPreferenceSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const saved = await upsertPreference(m.tx, {
      userId: ctx.actor.userId,
      workspaceId: ctx.workspace.id,
      type: input.type,
      inApp: input.inApp,
      email: input.email,
    });
    m.emit({
      topic: `user:${ctx.actor.userId}`,
      type: "notification.preferences",
      payload: { type: input.type },
    });
    return saved;
  });
}

/**
 * The unique key includes a nullable projectId, which Postgres treats as
 * distinct; workspace-wide rows are therefore found and updated by hand.
 */
async function upsertPreference(
  tx: TransactionClient,
  p: {
    userId: string;
    workspaceId: string;
    type: Prisma.NotificationPreferenceCreateInput["type"];
    inApp?: boolean;
    email?: boolean;
  },
) {
  // Serialize concurrent toggles of the same row (no unique index can help).
  const lockKey = `notification-pref:${p.userId}:${p.workspaceId}:${p.type}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
  const existing = await tx.notificationPreference.findFirst({
    where: { userId: p.userId, workspaceId: p.workspaceId, projectId: null, type: p.type },
    select: { id: true },
  });
  const select = { type: true, inApp: true, email: true } as const;
  if (existing)
    return tx.notificationPreference.update({
      where: { id: existing.id },
      data: {
        ...(p.inApp !== undefined ? { inApp: p.inApp } : {}),
        ...(p.email !== undefined ? { email: p.email } : {}),
      },
      select,
    });
  return tx.notificationPreference.create({
    data: {
      userId: p.userId,
      workspaceId: p.workspaceId,
      projectId: null,
      type: p.type,
      inApp: p.inApp ?? true,
      email: p.email ?? false,
    },
    select,
  });
}
