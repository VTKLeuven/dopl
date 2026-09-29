import type { Prisma, TransactionClient } from "@dopl/db";
import {
  COALESCE_WINDOW_MS,
  COALESCED_EVENTS,
  type DeliveryPayload,
} from "@dopl/shared/schemas/webhooks";
import type { WebhookEvent } from "@dopl/shared/schemas/webhooks";

/** A domain event for outgoing webhooks (D-052); matched and queued on commit. */
export interface WebhookEventInput {
  event: WebhookEvent;
  entityType: "WORK_ITEM" | "INTAKE_ITEM" | "EMAIL_THREAD";
  entityId: string;
  /** Project events carry their project, mailbox events their mailbox; each filter applies to its own kind. */
  projectId: string | null;
  mailboxId?: string | null;
  detail?: Record<string, Prisma.InputJsonValue>;
}

/** How the caller puts a job in the same transaction (web and worker each have their own pg-boss). */
export type EnqueueDelivery = (
  tx: TransactionClient,
  deliveryId: string,
  startAfter: Date | null,
) => Promise<void>;

/**
 * Matches domain events to enabled webhooks and queues deliveries inside the
 * mutation's transaction (D-052), so a delivery exists iff the change
 * committed. Updates to one entity within the coalescing window append to the
 * delivery that is still waiting, which becomes one Discord message.
 */
export async function queueWebhookEvents(
  tx: TransactionClient,
  workspaceId: string,
  events: WebhookEventInput[],
  enqueue: EnqueueDelivery,
): Promise<void> {
  const hooks = await tx.outgoingWebhook.findMany({
    where: { workspaceId, enabled: true, events: { hasSome: events.map((e) => e.event) } },
    select: { id: true, events: true, projectIds: true, mailboxIds: true },
  });
  if (hooks.length === 0) return;
  const now = new Date();

  for (const e of events) {
    const entry = { type: e.event, at: now.toISOString(), detail: e.detail ?? {} };
    for (const hook of hooks) {
      if (!hook.events.includes(e.event)) continue;
      // Empty filter lists mean "all projects" / "all mailboxes".
      if (e.projectId && hook.projectIds.length > 0 && !hook.projectIds.includes(e.projectId))
        continue;
      if (e.mailboxId && hook.mailboxIds.length > 0 && !hook.mailboxIds.includes(e.mailboxId))
        continue;
      const coalesceKey = `${hook.id}:${e.entityType}:${e.entityId}`;

      if (COALESCED_EVENTS.has(e.event)) {
        // Atomic append to a delivery whose window is still open.
        const appended = await tx.$executeRaw`
          UPDATE webhook_deliveries
          SET payload = jsonb_set(payload, '{events}', (payload->'events') || ${JSON.stringify([entry])}::jsonb)
          WHERE "coalesceKey" = ${coalesceKey} AND status = 'PENDING' AND "sentAt" IS NULL
            AND "notBefore" > now() AND jsonb_array_length(payload->'events') < 50`;
        if (appended > 0) continue;
      }

      const notBefore = COALESCED_EVENTS.has(e.event)
        ? new Date(now.getTime() + COALESCE_WINDOW_MS)
        : now;
      const payload: DeliveryPayload = { events: [entry] };
      const delivery = await tx.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          workspaceId,
          eventType: e.event,
          entityType: e.entityType,
          entityId: e.entityId,
          coalesceKey,
          payload: payload as unknown as Prisma.InputJsonValue,
          notBefore,
        },
        select: { id: true },
      });
      await enqueue(tx, delivery.id, notBefore > now ? notBefore : null);
    }
  }
}
