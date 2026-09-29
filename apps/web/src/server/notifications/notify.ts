import "server-only";
import type { EntityType, NotificationType, Prisma } from "@dopl/db";
import type { BaseMutation } from "../mutation";

export interface NotifyInput {
  recipientIds: string[];
  type: NotificationType;
  entityType: EntityType;
  entityId: string;
  projectId?: string | null;
  workItemId?: string | null;
  messageId?: string | null;
  emailThreadId?: string | null;
  agentApprovalId?: string | null;
  /** Unread rows with the same key collapse into one (latest actor and data win). */
  groupKey?: string | null;
  /** Render payload: titles, identifiers, excerpt. Keep it small. */
  data: Prisma.InputJsonObject;
}

/**
 * Inbox notifications (Phase 4), written in the caller's transaction:
 * - the actor never notifies themselves;
 * - in-app preferences (per type, optionally per project) are honoured;
 * - an unread row with the same `groupKey` is refreshed instead of adding a
 *   new one, and moves to the top (its `createdAt` is the latest activity);
 * - each recipient gets a `user:<id>` realtime event for badges.
 * Email digests read the same rows later (`email.digest`).
 */
export async function notify(m: BaseMutation, input: NotifyInput): Promise<void> {
  const { tx, workspaceId } = m;
  const actorId = m.actor.userId;
  const candidates = [...new Set(input.recipientIds)].filter((id) => id !== actorId);
  if (candidates.length === 0) return;

  const prefs = await tx.notificationPreference.findMany({
    where: {
      workspaceId,
      userId: { in: candidates },
      type: input.type,
      OR: [{ projectId: null }, ...(input.projectId ? [{ projectId: input.projectId }] : [])],
    },
    select: { userId: true, projectId: true, inApp: true },
  });
  const muted = new Set<string>();
  for (const userId of candidates) {
    const mine = prefs.filter((p) => p.userId === userId);
    const effective = mine.find((p) => p.projectId !== null) ?? mine.find((p) => !p.projectId);
    if (effective && !effective.inApp) muted.add(userId);
  }
  const recipients = candidates.filter((id) => !muted.has(id));
  if (recipients.length === 0) return;

  const now = new Date();
  const existing = input.groupKey
    ? await tx.notification.findMany({
        where: {
          recipientId: { in: recipients },
          groupKey: input.groupKey,
          readAt: null,
          archivedAt: null,
        },
        select: { id: true, recipientId: true, data: true },
      })
    : [];
  const byRecipient = new Map(existing.map((n) => [n.recipientId, n]));

  for (const recipientId of recipients) {
    const prev = byRecipient.get(recipientId);
    let id: string;
    if (prev) {
      const prevData = (prev.data ?? {}) as { count?: number };
      const updated = await tx.notification.update({
        where: { id: prev.id },
        data: {
          actorId,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          data: { ...input.data, count: (prevData.count ?? 1) + 1 },
          // Point at the latest message of a collapsed thread.
          ...(input.messageId ? { messageId: input.messageId } : {}),
          createdAt: now,
          snoozedUntil: null,
          emailedAt: null,
        },
        select: { id: true },
      });
      id = updated.id;
    } else {
      const created = await tx.notification.create({
        data: {
          workspaceId,
          recipientId,
          actorId,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          projectId: input.projectId ?? null,
          workItemId: input.workItemId ?? null,
          messageId: input.messageId ?? null,
          emailThreadId: input.emailThreadId ?? null,
          agentApprovalId: input.agentApprovalId ?? null,
          groupKey: input.groupKey ?? null,
          data: input.data,
        },
        select: { id: true },
      });
      id = created.id;
    }
    m.emit({ topic: `user:${recipientId}`, type: "notification.created", payload: { id } });
  }
}
