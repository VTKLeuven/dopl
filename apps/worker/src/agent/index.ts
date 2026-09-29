import type { Server } from "node:http";
import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { DbClient } from "@dopl/db";
import { queues } from "@dopl/shared/jobs/queues";
import { txEnqueue } from "../enqueue";
import { env } from "../env";
import { FakeExecutor, WarpgateExecutor, type Executor } from "./executor";
import { startFakeHermes } from "./fake-hermes";
import {
  handleAgentCheck,
  handleAgentExec,
  handleAgentRun,
  handleAgentStop,
  handleRuntimeApproval,
  reconcileAgents,
  type AgentDeps,
} from "./jobs";

/** The fake Hermes' bearer key when the profile's env var isn't set (dev only). */
export const FAKE_HERMES_KEY = "fake-hermes-dev-key";

function executor(logger: Logger): Executor {
  if (env.AGENT_EXEC_FAKE) {
    logger.warn("agent commands use the FAKE executor (AGENT_EXEC_FAKE)");
    return new FakeExecutor();
  }
  const { AGENT_SSH_KEY_FILE: keyFile, WARPGATE_HOST: host, WARPGATE_HOST_KEY: hostKey } = env;
  if (keyFile && host && hostKey)
    return new WarpgateExecutor({
      host,
      port: env.WARPGATE_PORT,
      user: env.AGENT_SSH_USER,
      keyFile,
      hostKeyFingerprint: hostKey,
    });
  return {
    run: () =>
      Promise.reject(
        new Error(
          "The worker has no SSH access configured (AGENT_SSH_KEY_FILE, WARPGATE_HOST, WARPGATE_HOST_KEY in worker.env).",
        ),
      ),
  };
}

/** AI teammate (Phase 8): runs, commands, approvals bridged to Hermes, reconciliation. */
export async function registerAgentHandlers(ctx: {
  boss: PgBoss;
  db: DbClient;
  logger: Logger;
}): Promise<() => void> {
  const { boss, db, logger } = ctx;
  let fake: Server | null = null;
  if (env.HERMES_FAKE_PORT) {
    fake = await startFakeHermes({
      port: env.HERMES_FAKE_PORT,
      apiKey: process.env.HERMES_API_KEY || FAKE_HERMES_KEY,
      mcpUrl: new URL("/api/mcp", env.APP_URL).toString(),
      mcpToken: env.HERMES_FAKE_MCP_TOKEN ?? "",
      streamDelayMs: 15,
    });
    logger.warn({ port: env.HERMES_FAKE_PORT }, "fake Hermes listening (dev only)");
  }
  const deps: AgentDeps = {
    db,
    boss,
    logger,
    enqueue: txEnqueue(boss),
    encryptionKey: env.DOPL_ENCRYPTION_KEY,
    executor: executor(logger),
    execTimeoutMs: env.AGENT_EXEC_TIMEOUT_SEC * 1000,
    fallbackApiKey: env.HERMES_FAKE_PORT ? FAKE_HERMES_KEY : undefined,
  };

  // Runs follow a runtime for minutes: several at once, one per job.
  await boss.work("agent.run", { batchSize: 1, localConcurrency: 8 }, async ([job]) => {
    if (!job) return;
    const { runId } = queues["agent.run"].parse(job.data);
    await handleAgentRun(deps, runId, job.signal);
  });
  await boss.work("agent.exec", { batchSize: 1, localConcurrency: 4 }, async ([job]) => {
    if (!job) return;
    const { stepId } = queues["agent.exec"].parse(job.data);
    await handleAgentExec(deps, stepId);
  });
  await boss.work("agent.runtime-approval", async ([job]) => {
    if (!job) return;
    await handleRuntimeApproval(deps, queues["agent.runtime-approval"].parse(job.data).approvalId);
  });
  await boss.work("agent.stop", async ([job]) => {
    if (!job) return;
    await handleAgentStop(deps, queues["agent.stop"].parse(job.data).runId);
  });
  await boss.work("agent.check", async ([job]) => {
    if (!job) return;
    const { profileId, requestId } = queues["agent.check"].parse(job.data);
    await handleAgentCheck(deps, profileId, requestId);
  });
  await boss.schedule("agent.reconcile", "* * * * *", {}, { tz: "Europe/Brussels" });
  await boss.work("agent.reconcile", async () => {
    await reconcileAgents(deps);
  });
  // Right away too: re-attach to runs a restart interrupted (red team 8).
  void reconcileAgents(deps).catch((err: unknown) => logger.warn({ err }, "agent reconcile at start"));

  return () => {
    fake?.close();
  };
}
