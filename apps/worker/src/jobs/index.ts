import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { DbClient } from "@dopl/db";
import { queues } from "@dopl/shared/jobs/queues";
import { sendOutboundEmail } from "../email/send";

export interface JobContext {
  boss: PgBoss;
  db: DbClient;
  logger: Logger;
}

/** Wires queue handlers and schedules. Each queue gets its own module as features land. */
export async function registerHandlers(ctx: JobContext): Promise<void> {
  const { boss, db, logger } = ctx;

  await boss.work("email.send", { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      const { outboundEmailId } = queues["email.send"].parse(job.data);
      const result = await sendOutboundEmail(db, outboundEmailId);
      logger.info({ outboundEmailId, result }, "email.send");
    }
  });

  // Nightly: prune ephemeral tables (D-023, D-025).
  await boss.schedule("maintenance.prune", "17 3 * * *", {}, { tz: "Europe/Brussels" });
  await boss.work("maintenance.prune", async () => {
    const [events, presences, counters] = await Promise.all([
      db.$executeRaw`DELETE FROM realtime_events WHERE "createdAt" < now() - interval '24 hours'`,
      db.$executeRaw`DELETE FROM presences WHERE "expiresAt" < now()`,
      db.$executeRaw`DELETE FROM rate_limit_counters WHERE "expiresAt" < now()`,
    ]);
    logger.info({ events, presences, counters }, "pruned ephemeral rows");
  });
}
