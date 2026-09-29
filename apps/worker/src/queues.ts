import { PgBoss } from "pg-boss";
import { queueNames } from "@dopl/shared/jobs/queues";

export const queueOptions = { retryLimit: 5, retryDelay: 10, retryBackoff: true, notify: true };

/** Creates (or updates) every queue in @dopl/shared/jobs/queues. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of queueNames) {
    await boss.createQueue(name, queueOptions); // no-op when it exists
    await boss.updateQueue(name, queueOptions); // keep options in sync
  }
}

/**
 * Installs the pg-boss schema and queues on a database without running any
 * workers. The test setup uses it so services can enqueue jobs in tests.
 */
export async function prepareQueues(connectionString: string): Promise<void> {
  const boss = new PgBoss({
    connectionString,
    schema: "pgboss",
    supervise: false,
    schedule: false,
  });
  await boss.start();
  await ensureQueues(boss);
  await boss.stop({ graceful: false });
}
