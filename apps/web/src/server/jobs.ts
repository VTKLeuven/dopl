import "server-only";
import { PgBoss } from "pg-boss";
import type { TransactionClient } from "@dopl/db";
import { queues, type QueueName, type QueuePayload } from "@dopl/shared/jobs/queues";
import { env } from "./env";

/**
 * Producer-only pg-boss instance (no workers, no maintenance, no cron):
 * web enqueues, apps/worker consumes (D-024). Jobs are inserted through the
 * caller's Prisma transaction so they exist iff the change commits.
 */
const globalForBoss = globalThis as unknown as { __doplBoss?: Promise<PgBoss> };

function getBoss(): Promise<PgBoss> {
  globalForBoss.__doplBoss ??= (async () => {
    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
      application_name: "dopl-web-boss",
      max: 2,
      supervise: false,
      schedule: false,
      migrate: false,
      createSchema: false,
    });
    boss.on("error", (err) => {
      console.error("[pg-boss producer]", err);
    });
    await boss.start();
    return boss;
  })();
  return globalForBoss.__doplBoss;
}

export async function enqueue<Q extends QueueName>(
  tx: TransactionClient,
  queue: Q,
  payload: QueuePayload<Q>,
  options: { singletonKey?: string; startAfter?: Date } = {},
): Promise<void> {
  const data = queues[queue].parse(payload);
  const boss = await getBoss();
  await boss.send(queue, data, {
    ...options,
    db: {
      executeSql: async (text: string, values?: unknown[]) => ({
        rows: await tx.$queryRawUnsafe<unknown[]>(text, ...(values ?? [])),
      }),
    },
  });
}
