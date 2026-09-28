import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { DbClient } from "@dopl/db";

export interface JobContext {
  boss: PgBoss;
  db: DbClient;
  logger: Logger;
}

/** Wires queue handlers and schedules. Each queue gets its own module as features land. */
export async function registerHandlers(ctx: JobContext): Promise<void> {
  const { boss, db, logger } = ctx;

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
