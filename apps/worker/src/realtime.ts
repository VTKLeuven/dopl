import type { Prisma, TransactionClient } from "@dopl/db";

/**
 * The worker's side of the realtime outbox (D-023): same table, same NOTIFY
 * channel as the web app's withMutation, so open browsers update when a job
 * changes something (a snooze ends, a webhook gets disabled).
 */
export async function emitRealtime(
  tx: TransactionClient,
  event: { workspaceId: string; topic: string; type: string; payload: Prisma.InputJsonValue },
): Promise<void> {
  const row = await tx.realtimeEvent.create({ data: event, select: { id: true } });
  await tx.$executeRaw`SELECT pg_notify('dopl_realtime', ${row.id.toString()})`;
}

/** An Inbox notification from a job (no human actor). */
export async function notifyFromJob(
  tx: TransactionClient,
  n: {
    workspaceId: string;
    recipientIds: string[];
    type: "SNOOZE_ENDED" | "INTEGRATION_FAILED";
    entityType: "INTAKE_ITEM" | "WORKSPACE" | "EMAIL_THREAD";
    entityId: string;
    projectId?: string | null;
    workItemId?: string | null;
    emailThreadId?: string | null;
    data: Prisma.InputJsonObject;
  },
): Promise<void> {
  for (const recipientId of new Set(n.recipientIds)) {
    const row = await tx.notification.create({
      data: {
        workspaceId: n.workspaceId,
        recipientId,
        type: n.type,
        entityType: n.entityType,
        entityId: n.entityId,
        projectId: n.projectId ?? null,
        workItemId: n.workItemId ?? null,
        emailThreadId: n.emailThreadId ?? null,
        data: n.data,
      },
      select: { id: true },
    });
    await emitRealtime(tx, {
      workspaceId: n.workspaceId,
      topic: `user:${recipientId}`,
      type: "notification.created",
      payload: { id: row.id },
    });
  }
}
