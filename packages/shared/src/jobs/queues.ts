/**
 * Every pg-boss queue in one place so web (producer) and worker (consumer)
 * agree on names and payloads. Add a queue here, then a handler in
 * apps/worker/src/jobs.
 */
import { z } from "zod";

export const queues = {
  "maintenance.purge": z.object({}),
  "maintenance.prune": z.object({}),
  "email.send": z.object({ outboundEmailId: z.uuid() }),
  /** Every 10 minutes: one digest email per user with unread, un-emailed notifications. */
  "email.digest": z.object({}),
  /** Posts one (possibly coalesced) Discord delivery (D-052). */
  "webhook.deliver": z.object({ deliveryId: z.uuid() }),
  /** Every minute: snoozed intake items come back to the queue. */
  "snooze.wake": z.object({}),
  "notifications.fanout": z.object({
    workspaceId: z.uuid(),
    activityIds: z.array(z.uuid()).min(1),
  }),
} as const;

export type QueueName = keyof typeof queues;
export type QueuePayload<Q extends QueueName> = z.infer<(typeof queues)[Q]>;
export const queueNames = Object.keys(queues) as QueueName[];
