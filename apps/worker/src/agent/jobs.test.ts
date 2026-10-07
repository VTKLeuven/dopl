/**
 * Phase 8 red-team tests on the worker side: Pause stops a running run
 * within 5 s (4), a DENY rule blocks a command even after approval (3), a
 * restarted worker reconciles a run through the runtime's status (8),
 * command output is redacted, and "Skip approvals" (D-140) runs commands
 * and answers Hermes without anyone deciding.
 */
import { describe, expect, it } from "vitest";
import pino from "pino";
import { createDbClient } from "@dopl/db";
import { deriveRunToken, runTokenHash } from "@dopl/shared/domain/agent";
import { uuidv7 } from "@dopl/shared/ids";
import { FakeExecutor, type Executor } from "./executor";
import { handleAgentExec, handleAgentRun, type AgentDeps } from "./jobs";
import type { AgentRuntime, RuntimeEvent } from "./runtime";

const db = createDbClient({
  connectionString: process.env.DATABASE_URL ?? "",
  applicationName: "dopl-worker-agent-test",
  maxConnections: 4,
});
const KEY = "test-key-test-key-test-key-test-key-00";

function deps(overrides: Partial<AgentDeps> = {}): AgentDeps {
  return {
    db,
    boss: {} as never,
    logger: pino({ level: "silent" }),
    enqueue: () => Promise.resolve(),
    encryptionKey: KEY,
    executor: new FakeExecutor(),
    execTimeoutMs: 10_000,
    timing: { watchdogMs: 200, leaseMs: 300, busyRetryMs: 100, flushMs: 50 },
    ...overrides,
  };
}

async function setup() {
  const slug = `a-${crypto.randomUUID().slice(0, 8)}`;
  const ws = await db.workspace.create({ data: { slug, name: "VTK IT" } });
  const agent = await db.user.create({
    data: { email: `${slug}@dopl.invalid`, name: "Dopl", kind: "AGENT" },
  });
  await db.workspaceMember.create({
    data: { workspaceId: ws.id, userId: agent.id, role: "MEMBER" },
  });
  await db.agentProfile.create({
    data: {
      workspaceId: ws.id,
      userId: agent.id,
      baseUrl: "http://127.0.0.1:1",
      apiKeyEnv: "HERMES_API_KEY",
      runTimeoutSec: 600,
    },
  });
  const project = await db.project.create({
    data: { workspaceId: ws.id, identifier: "INFRA", name: "Infrastructure" },
  });
  const state = await db.workflowState.create({
    data: {
      workspaceId: ws.id,
      projectId: project.id,
      name: "Todo",
      color: "grey",
      group: "UNSTARTED",
      sortKey: "a0",
    },
  });
  const item = await db.workItem.create({
    data: {
      workspaceId: ws.id,
      projectId: project.id,
      sequence: 1,
      title: "Check the proxy",
      stateId: state.id,
      stateGroup: "UNSTARTED",
      sortKey: "a0",
    },
  });
  const host = await db.agentHost.create({
    data: {
      workspaceId: ws.id,
      name: "lab-01",
      hostname: "lab-01",
      warpgateTarget: "lab-01",
      environment: "LAB",
    },
  });
  return { ws, agent, item, host };
}
type Setup = Awaited<ReturnType<typeof setup>>;

async function makeRun(s: Setup, data: { status: "QUEUED" | "RUNNING"; runtimeRunId?: string }) {
  const id = uuidv7();
  return db.agentRun.create({
    data: {
      id,
      workspaceId: s.ws.id,
      agentUserId: s.agent.id,
      trigger: "MANUAL",
      prompt: "check it",
      runTokenHash: runTokenHash(deriveRunToken(KEY, id)),
      workItemId: s.item.id,
      startedAt: data.status === "RUNNING" ? new Date() : null,
      ...data,
    },
  });
}

const skipApprovals = (s: Setup, on: boolean) =>
  db.agentProfile.update({
    where: { userId: s.agent.id },
    data: { settings: { skipApprovals: on } },
  });

/** A runtime whose event stream stays open until aborted. */
function hangingRuntime(): AgentRuntime & { stops: number; started: number } {
  const rt = {
    kind: "HERMES" as const,
    stops: 0,
    started: 0,
    capabilities: () => Promise.resolve({ ok: true, model: null, features: {}, missing: [] }),
    startRun: () => {
      rt.started++;
      return Promise.resolve({ runtimeRunId: "run_hang" });
    },
    async *events(_id: string, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
      yield { type: "message.delta", text: "Working on it" };
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          resolve();
        });
      });
    },
    resolveApproval: () => Promise.resolve(),
    stop: () => {
      rt.stops++;
      return Promise.resolve();
    },
    status: () => Promise.resolve({ status: "running" as const }),
  };
  return rt;
}

describe("agent.run", () => {
  it("4: Pause stops a running run within 5 seconds and tells the runtime", async () => {
    const s = await setup();
    const run = await makeRun(s, { status: "QUEUED" });
    const runtime = hangingRuntime();
    const done = handleAgentRun(deps({ runtimeFor: () => runtime }), run.id);
    await expect
      .poll(async () => (await db.agentRun.findUniqueOrThrow({ where: { id: run.id } })).status)
      .toBe("RUNNING");
    const paused = Date.now();
    await db.workspace.update({ where: { id: s.ws.id }, data: { agentPausedAt: new Date() } });
    await done;
    expect(Date.now() - paused).toBeLessThan(5_000);
    expect(runtime.stops).toBeGreaterThanOrEqual(1);
    expect(await db.agentRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      status: "CANCELLED",
      cancelReason: "agent_paused",
    });
  });

  it("Stop (a cancelled run) ends the follower and stops the runtime", async () => {
    const s = await setup();
    const run = await makeRun(s, { status: "QUEUED" });
    const runtime = hangingRuntime();
    const done = handleAgentRun(deps({ runtimeFor: () => runtime }), run.id);
    await expect
      .poll(
        async () => (await db.agentRun.findUniqueOrThrow({ where: { id: run.id } })).runtimeRunId,
      )
      .toBe("run_hang");
    await db.agentRun.update({ where: { id: run.id }, data: { status: "CANCELLED" } });
    await done;
    expect(runtime.stops).toBeGreaterThanOrEqual(1);
  });

  it("8: after a restart, a stale run is re-attached and reconciled through its status", async () => {
    const s = await setup();
    const run = await makeRun(s, { status: "RUNNING", runtimeRunId: "run_old" });
    await db.$executeRaw`UPDATE agent_runs SET "updatedAt" = now() - interval '5 minutes' WHERE id = ${run.id}::uuid`;
    let statusCalls = 0;
    const runtime: AgentRuntime = {
      ...hangingRuntime(),
      startRun: () => Promise.reject(new Error("must not start a second run")),
      events: (): AsyncIterable<RuntimeEvent> => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error("connection refused")),
        }),
      }),
      status: () => {
        statusCalls++;
        return Promise.resolve({ status: "completed", output: "The proxy is healthy." });
      },
    };
    await handleAgentRun(deps({ runtimeFor: () => runtime }), run.id);
    expect(statusCalls).toBe(1);
    expect(await db.agentRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      status: "COMPLETED",
      result: "The proxy is healthy.",
    });
    const reply = await db.comment.findFirstOrThrow({ where: { agentRunId: run.id } });
    expect(reply).toMatchObject({ authorId: s.agent.id, bodyText: "The proxy is healthy." });
  });

  it("answers Hermes' own approval requests with once while approvals are skipped (D-140)", async () => {
    const s = await setup();
    await skipApprovals(s, true);
    const run = await makeRun(s, { status: "QUEUED" });
    const answers: Array<[string, string, string]> = [];
    const request = {
      type: "approval.requested" as const,
      requestId: "req_1",
      tool: "terminal",
      description: "ls /tmp",
    };
    const runtime: AgentRuntime = {
      ...hangingRuntime(),
      startRun: () => Promise.resolve({ runtimeRunId: "run_auto" }),
      async *events(): AsyncIterable<RuntimeEvent> {
        // The request is seen twice, as after a re-attach.
        const events: RuntimeEvent[] = [
          request,
          request,
          { type: "run.completed", output: "Done." },
        ];
        for (const ev of events) yield await Promise.resolve(ev);
      },
      resolveApproval: (runId, requestId, choice) => {
        answers.push([runId, requestId, choice]);
        return Promise.resolve();
      },
    };
    await handleAgentRun(deps({ runtimeFor: () => runtime }), run.id);
    expect(answers).toEqual([["run_auto", "req_1", "once"]]);
    expect(await db.agentApproval.count({ where: { runId: run.id } })).toBe(0);
    const step = await db.agentRunStep.findFirstOrThrow({
      where: { runId: run.id, kind: "TOOL_CALL" },
    });
    expect(step).toMatchObject({ status: "SUCCEEDED", toolName: "terminal", command: "ls /tmp" });
    expect(
      await db.auditLog.count({ where: { action: "agent.approval.skipped", targetId: step.id } }),
    ).toBe(1);
    expect((await db.agentRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      "COMPLETED",
    );
  });

  it("doesn't take over a run whose follower is still alive", async () => {
    const s = await setup();
    const run = await makeRun(s, { status: "RUNNING", runtimeRunId: "run_live" });
    const runtime = hangingRuntime();
    const start = Date.now();
    // Another follower beat just now (and keeps its lease for this whole test).
    await db.$executeRaw`UPDATE agent_runs SET "updatedAt" = now() + interval '1 hour' WHERE id = ${run.id}::uuid`;
    const d = deps({ runtimeFor: () => runtime });
    await handleAgentRun({ ...d, timing: { ...d.timing, leaseMs: 300 } }, run.id);
    expect(Date.now() - start).toBeLessThan(5_000);
    expect(runtime.started).toBe(0);
  });
});

describe("agent.exec", () => {
  async function commandStep(s: Setup, command: string, approved: boolean | null) {
    const run = await makeRun(s, { status: "RUNNING", runtimeRunId: "run_x" });
    const step = await db.agentRunStep.create({
      data: {
        runId: run.id,
        seq: 1,
        kind: "COMMAND",
        command,
        hostId: s.host.id,
        input: approved === null ? { decision: "allowlisted" } : { decision: "approval" },
      },
    });
    if (approved !== null)
      await db.agentApproval.create({
        data: {
          workspaceId: s.ws.id,
          runId: run.id,
          stepId: step.id,
          kind: "INFRA_COMMAND",
          status: approved ? "APPROVED" : "PENDING",
          command,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
    return { run, step };
  }

  it("3: a DENY rule blocks a command even after it was approved", async () => {
    const s = await setup();
    const { step } = await commandStep(s, "reboot", true);
    await db.agentCommandRule.create({
      data: { workspaceId: s.ws.id, kind: "DENY", pattern: "reboot" },
    });
    let ran = false;
    const executor: Executor = {
      run: () => {
        ran = true;
        return Promise.resolve({ exitCode: 0, signal: null, timedOut: false, killed: false });
      },
    };
    await handleAgentExec(deps({ executor }), step.id);
    expect(ran).toBe(false);
    expect(await db.agentRunStep.findUniqueOrThrow({ where: { id: step.id } })).toMatchObject({
      status: "DENIED",
    });
    expect(
      await db.auditLog.count({ where: { action: "agent.command.refused", targetId: step.id } }),
    ).toBe(1);
  });

  it("refuses a command that is neither approved nor allowlisted any more", async () => {
    const s = await setup();
    const { step } = await commandStep(s, "uptime", null); // no allow rule exists
    await handleAgentExec(deps(), step.id);
    expect((await db.agentRunStep.findUniqueOrThrow({ where: { id: step.id } })).status).toBe(
      "FAILED",
    );
  });

  it("runs a command nobody approved while approvals are skipped, tainted run or not (D-140)", async () => {
    const s = await setup();
    await skipApprovals(s, true);
    const { run, step } = await commandStep(s, "docker compose up -d", null);
    await db.agentRun.update({ where: { id: run.id }, data: { untrusted: true } });
    await handleAgentExec(deps(), step.id);
    expect((await db.agentRunStep.findUniqueOrThrow({ where: { id: step.id } })).status).toBe(
      "SUCCEEDED",
    );
    const started = await db.auditLog.findFirstOrThrow({
      where: { action: "agent.command.started", targetId: step.id },
    });
    expect(started.metadata).toMatchObject({ approvalId: null, approvalsSkipped: true });

    // Switched back on before the worker got to it: it isn't run.
    await skipApprovals(s, false);
    const { step: later } = await commandStep(s, "docker compose up -d", null);
    await handleAgentExec(deps(), later.id);
    expect((await db.agentRunStep.findUniqueOrThrow({ where: { id: later.id } })).status).toBe(
      "FAILED",
    );
  });

  it("runs an approved command, redacts secrets and logs it", async () => {
    const s = await setup();
    const { step } = await commandStep(s, "cat .env", true);
    await handleAgentExec(deps(), step.id);
    const done = await db.agentRunStep.findUniqueOrThrow({ where: { id: step.id } });
    expect(done).toMatchObject({ status: "SUCCEEDED", exitCode: 0 });
    expect(done.output).not.toContain("hunter22");
    expect(done.output).toContain("POSTGRES_PASSWORD=[REDACTED]");
    expect(
      await db.auditLog.findMany({
        where: { targetId: step.id },
        select: { action: true },
        orderBy: { createdAt: "asc" },
      }),
    ).toEqual([{ action: "agent.command.started" }, { action: "agent.command.finished" }]);
  });

  it("4: Stop kills a running command within seconds", async () => {
    const s = await setup();
    const { run, step } = await commandStep(s, "sleep 30", true);
    const started = Date.now();
    const done = handleAgentExec(deps(), step.id);
    await new Promise((r) => setTimeout(r, 300));
    await db.agentRun.update({ where: { id: run.id }, data: { status: "CANCELLED" } });
    await done;
    expect(Date.now() - started).toBeLessThan(5_000);
    expect((await db.agentRunStep.findUniqueOrThrow({ where: { id: step.id } })).status).toBe(
      "CANCELLED",
    );
  });
});
