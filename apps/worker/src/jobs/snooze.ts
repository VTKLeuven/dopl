import type { Logger } from "pino";
import type { DbClient } from "@dopl/db";
import { emitRealtime, notifyFromJob } from "../realtime";

/**
 * Every minute: snoozed intake items whose time has come return to Pending,
 * and whoever snoozed them gets an Inbox notification. Inbox notifications
 * that were snoozed reappear on their own (the list filters by time); their
 * owners get a realtime nudge so badges update.
 */
export async function wakeSnoozed(db: DbClient, logger: Logger): Promise<number> {
  const now = new Date();
  const due = await db.intakeItem.findMany({
    where: { status: "PENDING", snoozedUntil: { lte: now } },
    take: 200,
    select: {
      id: true,
      number: true,
      workspaceId: true,
      projectId: true,
      workItemId: true,
      workItem: { select: { title: true } },
      project: { select: { identifier: true } },
    },
  });
  for (const intake of due) {
    await db.$transaction(async (tx) => {
      const woke = await tx.intakeItem.updateMany({
        where: { id: intake.id, status: "PENDING", snoozedUntil: { lte: now } },
        data: { snoozedUntil: null },
      });
      if (woke.count === 0) return; // someone acted on it meanwhile
      const snoozedBy = await tx.activity.findFirst({
        where: {
          workItemId: intake.workItemId,
          verb: "triaged",
          meta: { path: ["decision"], equals: "snoozed" },
        },
        orderBy: { createdAt: "desc" },
        select: { actorId: true },
      });
      if (snoozedBy?.actorId) {
        const active = await tx.workspaceMember.findFirst({
          where: {
            workspaceId: intake.workspaceId,
            userId: snoozedBy.actorId,
            status: "ACTIVE",
            role: { not: "GUEST" },
          },
          select: { userId: true },
        });
        if (active)
          await notifyFromJob(tx, {
            workspaceId: intake.workspaceId,
            recipientIds: [active.userId],
            type: "SNOOZE_ENDED",
            entityType: "INTAKE_ITEM",
            entityId: intake.id,
            projectId: intake.projectId,
            workItemId: intake.workItemId,
            data: {
              title: intake.workItem.title,
              intakeNumber: intake.number,
              projectIdentifier: intake.project.identifier,
            },
          });
      }
      await emitRealtime(tx, {
        workspaceId: intake.workspaceId,
        topic: `project:${intake.projectId}`,
        type: "intake.updated",
        payload: { id: intake.id, workItemId: intake.workItemId },
      });
    });
  }

  // Email threads (Phase 7): back in their views, and the assignee hears about it.
  const threads = await db.emailThread.findMany({
    where: { snoozedUntil: { lte: now } },
    take: 200,
    select: { id: true, workspaceId: true, mailboxId: true, assigneeId: true, subject: true },
  });
  for (const t of threads) {
    await db.$transaction(async (tx) => {
      const woke = await tx.emailThread.updateMany({
        where: { id: t.id, snoozedUntil: { lte: now } },
        data: { snoozedUntil: null },
      });
      if (woke.count === 0) return;
      if (t.assigneeId)
        await notifyFromJob(tx, {
          workspaceId: t.workspaceId,
          recipientIds: [t.assigneeId],
          type: "SNOOZE_ENDED",
          entityType: "EMAIL_THREAD",
          entityId: t.id,
          emailThreadId: t.id,
          data: { subject: t.subject },
        });
      await emitRealtime(tx, {
        workspaceId: t.workspaceId,
        topic: `mailbox:${t.mailboxId}`,
        type: "email.thread.updated",
        payload: { id: t.id },
      });
    });
  }

  // Inbox snoozes that just ended (within the last minute): nudge badges.
  const since = new Date(now.getTime() - 65_000);
  const notifications = await db.notification.findMany({
    where: { snoozedUntil: { gt: since, lte: now }, archivedAt: null },
    distinct: ["recipientId"],
    select: { recipientId: true, workspaceId: true, id: true },
    take: 500,
  });
  for (const n of notifications)
    await db.$transaction((tx) =>
      emitRealtime(tx, {
        workspaceId: n.workspaceId,
        topic: `user:${n.recipientId}`,
        type: "notification.updated",
        payload: { id: n.id },
      }),
    );
  if (due.length) logger.info({ count: due.length }, "snoozed intake woke up");
  return due.length;
}
