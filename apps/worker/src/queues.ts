import { PgBoss } from "pg-boss";
import { queueNames, type QueueName } from "@dopl/shared/jobs/queues";

export const queueOptions = { retryLimit: 5, retryDelay: 10, retryBackoff: true, notify: true };

/**
 * Queues that differ from the default. Agent runs follow a runtime for up
 * to hours and heartbeat, so a crashed worker's run is picked up again
 * within a minute and re-attaches (Phase 8). A command must never run
 * twice, so `agent.exec` is never retried.
 */
const overrides: Partial<Record<QueueName, Record<string, unknown>>> = {
  "agent.run": { retryLimit: 20, retryDelay: 15, expireInSeconds: 5 * 3600, heartbeatSeconds: 30 },
  "agent.exec": { retryLimit: 0, expireInSeconds: 2 * 3600, heartbeatSeconds: 30 },
  "agent.check": { retryLimit: 0, expireInSeconds: 120 },
  "agent.stop": { retryLimit: 5, retryDelay: 5 },
  "agent.runtime-approval": { retryLimit: 5, retryDelay: 5 },
};

export const optionsFor = (name: QueueName) => ({ ...queueOptions, ...overrides[name] });

/** Creates (or updates) every queue in @dopl/shared/jobs/queues. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of queueNames) {
    await boss.createQueue(name, optionsFor(name)); // no-op when it exists
    await boss.updateQueue(name, optionsFor(name)); // keep options in sync
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
