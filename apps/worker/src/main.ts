import { createServer } from "node:http";
import { PgBoss } from "pg-boss";
import { createDbClient } from "@dopl/db";
import { queueNames } from "@dopl/shared/jobs/queues";
import { ensureQueues } from "./queues";
import { env } from "./env";
import { logger } from "./logger";
import { registerHandlers } from "./jobs";

const db = createDbClient({
  connectionString: env.DATABASE_URL,
  applicationName: "dopl-worker",
  maxConnections: 5,
});

const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  schema: "pgboss",
  application_name: "dopl-worker-boss",
  useListenNotify: true, // jobs start the moment they commit (magic links!)
});
boss.on("error", (err) => {
  logger.error({ err }, "pg-boss error");
});

let healthy = false;
let stopConsumers: () => void = () => {};

async function main() {
  await boss.start();
  await ensureQueues(boss);
  stopConsumers = await registerHandlers({ boss, db, logger });
  healthy = true;
  logger.info({ queues: queueNames.length }, "worker started");
}

const health = createServer((req, res) => {
  if (req.url !== "/healthz") {
    res.writeHead(404).end();
    return;
  }
  db.$queryRaw`SELECT 1`
    .then(() => {
      res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: healthy }));
    })
    .catch(() => {
      res.writeHead(503).end(JSON.stringify({ ok: false }));
    });
});
health.listen(env.WORKER_HEALTH_PORT);

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  healthy = false;
  stopConsumers();
  health.close();
  await boss.stop({ graceful: true, timeout: 20_000 });
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err: unknown) => {
  logger.fatal({ err }, "worker failed to start");
  process.exit(1);
});
