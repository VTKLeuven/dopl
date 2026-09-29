import "server-only";
import type { Prisma, TransactionClient } from "@dopl/db";
import {
  COALESCE_WINDOW_MS,
  COALESCED_EVENTS,
  type DeliveryPayload,
} from "@dopl/shared/schemas/webhooks";
import { enqueue } from "../jobs";
import type { WebhookEventInput } from "../mutation";

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
): Promise<void> {
  const hooks = await tx.outgoingWebhook.findMany({
    where: { workspaceId, enabled: true, events: { hasSome: events.map((e) => e.event) } },
    select: { id: true, events: true, projectIds: true },
  });
  if (hooks.length === 0) return;
  const now = new Date();

  for (const e of events) {
    const entry = { type: e.event, at: now.toISOString(), detail: e.detail ?? {} };
    for (const hook of hooks) {
      if (!hook.events.includes(e.event)) continue;
      if (hook.projectIds.length > 0 && !hook.projectIds.includes(e.projectId)) continue;
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
      await enqueue(
        tx,
        "webhook.deliver",
        { deliveryId: delivery.id },
        notBefore > now ? { startAfter: notBefore } : {},
      );
    }
  }
}
