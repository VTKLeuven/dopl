import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { DbClient } from "@dopl/db";
import { queues } from "@dopl/shared/jobs/queues";
import { sendOutboundEmail } from "../email/send";
import { env } from "../env";
import { queueOptions } from "../queues";
import { sendDigests } from "./digest";
import { wakeSnoozed } from "./snooze";
import { deliverWebhook } from "./webhooks";

export interface JobContext {
  boss: PgBoss;
  db: DbClient;
  logger: Logger;
}

/** Wires queue handlers and schedules. Each queue gets its own module as features land. */
export async function registerHandlers(ctx: JobContext): Promise<void> {
  const { boss, db, logger } = ctx;
  const tz = { tz: "Europe/Brussels" };

  await boss.work("email.send", { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      const { outboundEmailId } = queues["email.send"].parse(job.data);
      const result = await sendOutboundEmail(db, outboundEmailId);
      logger.info({ outboundEmailId, result }, "email.send");
    }
  });

  // Discord deliveries (D-052). A thrown error lets pg-boss retry with backoff.
  await boss.work("webhook.deliver", { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      const { deliveryId } = queues["webhook.deliver"].parse(job.data);
      const outcome = await deliverWebhook(deliveryId, {
        db,
        boss,
        logger,
        appUrl: env.APP_URL,
        encryptionKey: env.DOPL_ENCRYPTION_KEY,
        retryCount: job.retryCount,
        retryLimit: queueOptions.retryLimit,
      });
      logger.info({ deliveryId, outcome }, "webhook.deliver");
      if (outcome === "retry") throw new Error(`webhook delivery ${deliveryId} failed; retrying`);
    }
  });

  // Inbox email digests (Phase 4): unread notifications, per preference.
  await boss.schedule("email.digest", "*/10 * * * *", {}, tz);
  await boss.work("email.digest", async () => {
    await sendDigests({ db, boss, logger, appUrl: env.APP_URL });
  });

  await boss.schedule("snooze.wake", "* * * * *", {}, tz);
  await boss.work("snooze.wake", async () => {
    await wakeSnoozed(db, logger);
  });

  // Nightly: prune ephemeral tables (D-023, D-025), abandoned uploads and
  // notes trashed 30 days ago (D-020).
  await boss.schedule("maintenance.prune", "17 3 * * *", {}, tz);
  await boss.work("maintenance.prune", async () => {
    const [events, presences, counters, deliveries, uploads, drafts] = await Promise.all([
      db.$executeRaw`DELETE FROM realtime_events WHERE "createdAt" < now() - interval '24 hours'`,
      db.$executeRaw`DELETE FROM presences WHERE "expiresAt" < now()`,
      db.$executeRaw`DELETE FROM rate_limit_counters WHERE "expiresAt" < now()`,
      db.$executeRaw`DELETE FROM webhook_deliveries WHERE "createdAt" < now() - interval '30 days'`,
      // Public uploads that never became part of a submission (their bytes
      // are removed by the storage lifecycle / next purge pass).
      db.$executeRaw`DELETE FROM attachments WHERE status = 'QUARANTINED' AND "createdAt" < now() - interval '2 days'`,
      // Chat uploads whose message was never sent.
      db.$executeRaw`DELETE FROM attachments WHERE status = 'PENDING' AND "messageId" IS NULL AND "createdAt" < now() - interval '2 days'`,
    ]);
    // Notes in the trash for 30 days are deleted for good, then tags with no
    // notes left in their subtree (as purging one note does).
    const notes =
      await db.$executeRaw`DELETE FROM notes WHERE "deletedAt" < now() - interval '30 days'`;
    const tags = await db.$executeRaw`
      DELETE FROM tags t
      WHERE NOT EXISTS (
        SELECT 1 FROM note_tags nt JOIN tags d ON d.id = nt."tagId"
        WHERE d."ownerId" = t."ownerId"
          AND (d.path = t.path OR starts_with(d.path, t.path || '/'))
      )`;
    logger.info(
      { events, presences, counters, deliveries, uploads, drafts, notes, tags },
      "pruned ephemeral rows",
    );
  });
}
