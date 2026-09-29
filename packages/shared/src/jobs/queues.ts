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
  /** Nightly: one project_daily_stats row per project for "over time" charts. */
  "analytics.snapshot": z.object({}),
  /* Shared mailbox (Phase 7). Only the worker holds Google credentials (D-027). */
  /** Token + label list for a newly connected mailbox, then starts the backfill. */
  "gmail.test": z.object({ mailboxId: z.uuid() }),
  /** Initial backfill or full resync (after a history 404); resumable by page token. */
  "gmail.backfill": z.object({ mailboxId: z.uuid(), kind: z.enum(["BACKFILL", "FULL_RESYNC"]) }),
  /** Partial sync from the stored historyId (singleton per mailbox). */
  "gmail.sync": z.object({ mailboxId: z.uuid(), reason: z.enum(["push", "poll", "manual"]) }),
  /** Daily: users.watch for every active mailbox. */
  "gmail.watch-renew": z.object({}),
  /** Every 5 minutes: a sync for every active mailbox, in case pushes stop. */
  "gmail.poll": z.object({}),
  /** Downloads one attachment into blob storage on first open. */
  "gmail.fetch-attachment": z.object({ attachmentId: z.uuid() }),
  /** Sends one outbound reply (Phase 7b). */
  "gmail.send": z.object({ messageId: z.uuid() }),
  /* AI teammate (Phase 8). Only the worker talks to Hermes and holds the SSH key (D-027). */
  /** Starts (or re-attaches to) one run and follows its events to the end. */
  "agent.run": z.object({ runId: z.uuid() }),
  /** Runs one approved or allowlisted command over SSH via Warpgate. */
  "agent.exec": z.object({ stepId: z.uuid() }),
  /** Answers a runtime-raised approval (Hermes `approval.request`): once or deny. */
  "agent.runtime-approval": z.object({ approvalId: z.uuid() }),
  /** Tells the runtime to stop a run the web side cancelled (Stop, Pause). */
  "agent.stop": z.object({ runId: z.uuid() }),
  /** Settings → AI teammate: reach the runtime and read its capabilities. */
  "agent.check": z.object({ profileId: z.uuid(), requestId: z.uuid() }),
  /** Every minute: expire approvals, time out runs, re-attach after a restart. */
  "agent.reconcile": z.object({}),
  "notifications.fanout": z.object({
    workspaceId: z.uuid(),
    activityIds: z.array(z.uuid()).min(1),
  }),
} as const;

export type QueueName = keyof typeof queues;
export type QueuePayload<Q extends QueueName> = z.infer<(typeof queues)[Q]>;
export const queueNames = Object.keys(queues) as QueueName[];
