import "server-only";
import type { TransactionClient } from "@dopl/db";
import { queueWebhookEvents as queue, type WebhookEventInput } from "@dopl/server/webhooks";
import { enqueue } from "../jobs";

/* The matching and coalescing live in @dopl/server, shared with the worker (mail events). */
export type { WebhookEventInput };

export function queueWebhookEvents(
  tx: TransactionClient,
  workspaceId: string,
  events: WebhookEventInput[],
): Promise<void> {
  return queue(tx, workspaceId, events, (t, deliveryId, startAfter) =>
    enqueue(t, "webhook.deliver", { deliveryId }, startAfter ? { startAfter } : {}),
  );
}
