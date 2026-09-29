/**
 * AI teammate helpers shared by web (MCP, approvals, Stop/Pause) and worker
 * (runtime events, executor, reconciler). Everything takes the caller's
 * transaction and an `emit` that writes to the realtime outbox, so run state
 * and the events describing it commit together.
 */
import type {
  AgentStepKind,
  AgentStepStatus,
  Prisma,
  TransactionClient,
} from "@dopl/db";

export type AgentEmit = (e: {
  topic: string;
  type: string;
  payload: Prisma.InputJsonValue;
}) => unknown;

export interface RunRef {
  id: string;
  workspaceId: string;
  workItemId: string | null;
  channelId: string | null;
}

export const runRefSelect = {
  id: true,
  workspaceId: true,
  workItemId: true,
  channelId: true,
} as const;

/**
 * One event per change, on the run's item or channel (timelines) and on
 * `agent:<workspace>` (the agent page, and web processes waiting on a step
 * or an approval in an MCP call).
 */
export async function emitAgentEvent(
  emit: AgentEmit,
  run: RunRef,
  type: string,
  extra: Record<string, Prisma.InputJsonValue | null> = {},
): Promise<void> {
  const payload = { runId: run.id, ...extra } as Prisma.InputJsonObject;
  if (run.workItemId) await emit({ topic: `workItem:${run.workItemId}`, type, payload });
  if (run.channelId) await emit({ topic: `channel:${run.channelId}`, type, payload });
  await emit({ topic: `agent:${run.workspaceId}`, type, payload });
}

/** Next step number; locks the run row so web and worker never collide. */
export async function nextStepSeq(tx: TransactionClient, runId: string): Promise<number> {
  await tx.$executeRaw`SELECT 1 FROM agent_runs WHERE id = ${runId}::uuid FOR UPDATE`;
  const last = await tx.agentRunStep.findFirst({
    where: { runId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  return (last?.seq ?? 0) + 1;
}

export async function createStep(
  tx: TransactionClient,
  emit: AgentEmit,
  run: RunRef,
  step: {
    kind: AgentStepKind;
    status?: AgentStepStatus;
    title?: string | null;
    toolName?: string | null;
    input?: Prisma.InputJsonValue;
    output?: string | null;
    command?: string | null;
    hostId?: string | null;
    finished?: boolean;
  },
) {
  const seq = await nextStepSeq(tx, run.id);
  const row = await tx.agentRunStep.create({
    data: {
      runId: run.id,
      seq,
      kind: step.kind,
      status: step.status ?? "RUNNING",
      title: step.title ?? null,
      toolName: step.toolName ?? null,
      input: step.input,
      output: step.output ?? null,
      command: step.command ?? null,
      hostId: step.hostId ?? null,
      finishedAt: step.finished ? new Date() : null,
    },
    select: { id: true, seq: true },
  });
  await emitAgentEvent(emit, run, "agentStep.created", { stepId: row.id });
  return row;
}

/** Longest output kept in the database; the rest is marked truncated. */
export const STEP_OUTPUT_HEAD = 64 * 1024;

export async function finishStep(
  tx: TransactionClient,
  emit: AgentEmit,
  run: RunRef,
  stepId: string,
  result: {
    status: AgentStepStatus;
    output?: string | null;
    exitCode?: number | null;
    outputTruncated?: boolean;
  },
) {
  const output =
    result.output != null && result.output.length > STEP_OUTPUT_HEAD
      ? result.output.slice(0, STEP_OUTPUT_HEAD)
      : result.output;
  await tx.agentRunStep.update({
    where: { id: stepId },
    data: {
      status: result.status,
      ...(output !== undefined ? { output } : {}),
      exitCode: result.exitCode ?? undefined,
      outputTruncated:
        result.outputTruncated ??
        (result.output != null && result.output.length > STEP_OUTPUT_HEAD),
      finishedAt: new Date(),
    },
  });
  await emitAgentEvent(emit, run, "agentStep.finished", { stepId, status: result.status });
}

/** Moves between RUNNING and WAITING_FOR_APPROVAL as approvals open and close. */
export async function syncWaitingStatus(tx: TransactionClient, emit: AgentEmit, run: RunRef) {
  const pending = await tx.agentApproval.count({ where: { runId: run.id, status: "PENDING" } });
  const next = pending > 0 ? "WAITING_FOR_APPROVAL" : "RUNNING";
  const changed = await tx.agentRun.updateMany({
    where: { id: run.id, status: { in: ["RUNNING", "WAITING_FOR_APPROVAL"] }, NOT: { status: next } },
    data: { status: next },
  });
  if (changed.count) await emitAgentEvent(emit, run, "agentRun.updated", { status: next });
}

/**
 * Ends a run from Dopl's side (Stop, Pause, timeout): cancels its pending
 * approvals and open steps. The worker's run loop notices within seconds,
 * stops the runtime and kills any SSH channel (red team 4).
 */
export async function cancelRun(
  tx: TransactionClient,
  emit: AgentEmit,
  run: RunRef,
  opts: {
    status?: "CANCELLED" | "FAILED" | "INTERRUPTED";
    reason: string;
    cancelledById?: string | null;
  },
): Promise<boolean> {
  const status = opts.status ?? "CANCELLED";
  const changed = await tx.agentRun.updateMany({
    where: { id: run.id, status: { in: ["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"] } },
    data: {
      status,
      cancelReason: status === "CANCELLED" ? opts.reason : undefined,
      error: status === "CANCELLED" ? undefined : opts.reason,
      cancelledById: opts.cancelledById ?? null,
      finishedAt: new Date(),
    },
  });
  if (!changed.count) return false;
  const approvals = await tx.agentApproval.findMany({
    where: { runId: run.id, status: "PENDING" },
    select: { id: true },
  });
  if (approvals.length) {
    await tx.agentApproval.updateMany({
      where: { id: { in: approvals.map((a) => a.id) } },
      data: { status: "CANCELLED", decidedAt: new Date(), decisionNote: opts.reason },
    });
    for (const a of approvals)
      await emitAgentEvent(emit, run, "agentApproval.decided", {
        approvalId: a.id,
        status: "CANCELLED",
      });
  }
  await tx.agentRunStep.updateMany({
    where: { runId: run.id, status: "RUNNING" },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  await emitAgentEvent(emit, run, "agentRun.updated", { status });
  return true;
}
