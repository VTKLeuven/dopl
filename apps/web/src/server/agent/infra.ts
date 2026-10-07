import "server-only";
import type { Prisma } from "@dopl/db";
import { createStep, finishStep, runRefSelect, type RunRef } from "@dopl/server/agent";
import { evaluateInfraExec, normalizeCommand } from "@dopl/shared/domain/agent";
import { db } from "../db";
import { enqueue } from "../jobs";
import { audit, withMutation } from "../mutation";
import { stepWithApproval } from "./approvals";
import { agentCtx, McpError, type McpPrincipal, type McpRun } from "./mcp-auth";
import { waitFor } from "./wait";

/** How long one MCP call blocks before answering `pending_approval` (D-032). */
export const TOOL_WAIT_MS = Number(process.env.DOPL_MCP_WAIT_MS ?? 10 * 60_000);
/** Command output handed back to the model (the step keeps up to 64 KB). */
const OUTPUT_FOR_MODEL = 16_000;

export interface WaitOptions {
  signal?: AbortSignal;
  onTick?: (elapsedMs: number) => Promise<void> | void;
}

export type ToolResult = Record<string, Prisma.InputJsonValue | null>;

const runRef = (run: McpRun): RunRef & { untrusted: boolean } => ({
  id: run.id,
  workspaceId: run.workspaceId,
  workItemId: run.workItemId,
  channelId: run.channelId,
  untrusted: run.untrusted,
});

/**
 * `infra_exec` (D-031): deny, run at once (allowlisted in a clean run, or
 * approvals switched off, D-140) or ask a human. Allowed and approved
 * commands run in the worker; this call waits for the result for up to
 * TOOL_WAIT_MS.
 */
export async function infraExec(
  principal: McpPrincipal,
  run: McpRun,
  args: { host: string; command: string; reason: string },
  wait: WaitOptions,
): Promise<ToolResult> {
  const ctx = agentCtx(principal, run.id);
  const command = normalizeCommand(args.command);
  const [host, rules] = await Promise.all([
    db.agentHost.findUnique({
      where: { workspaceId_name: { workspaceId: run.workspaceId, name: args.host } },
      select: {
        id: true,
        name: true,
        warpgateTarget: true,
        environment: true,
        enabled: true,
        alwaysRequireApproval: true,
      },
    }),
    db.agentCommandRule.findMany({
      where: { workspaceId: run.workspaceId, enabled: true },
      select: { id: true, kind: true, pattern: true, hostId: true, enabled: true },
    }),
  ]);
  const decision = evaluateInfraExec({
    paused: false, // resolveRun refused a paused workspace already
    runActive: true,
    host,
    rules,
    command,
    tainted: run.untrusted,
    skipApprovals: run.skipApprovals,
  });
  const ref = runRef(run);

  if (decision.decision === "deny") {
    // No step with a host that isn't allowlisted: nothing was attempted.
    await withMutation(ctx, async (m) => {
      await createStep(m.tx, (e) => m.emit(e), ref, {
        kind: "COMMAND",
        status: "DENIED",
        title: args.host,
        command,
        hostId: host?.id ?? null,
        input: { host: args.host, reason: args.reason, decision: decision.reason },
        output: denyMessage(decision.reason),
        finished: true,
      });
      await audit(m.tx, ctx, {
        action: "agent.command.refused",
        targetType: "agent_run",
        targetId: run.id,
        metadata: {
          host: args.host,
          command,
          reason: decision.reason,
          ruleId: decision.ruleId ?? null,
        },
      });
    });
    return { status: "denied", reason: denyMessage(decision.reason) };
  }

  if (decision.decision === "run") {
    const stepId = await withMutation(ctx, async (m) => {
      const step = await createStep(m.tx, (e) => m.emit(e), ref, {
        kind: "COMMAND",
        title: host!.name,
        command,
        hostId: host!.id,
        input: {
          host: host!.name,
          reason: args.reason,
          decision: decision.ruleId ? "allowlisted" : "approvals_skipped",
          ruleId: decision.ruleId,
        },
      });
      await enqueue(m.tx, "agent.exec", { stepId: step.id }, { singletonKey: step.id });
      return step.id;
    });
    return (await waitForStep(run, stepId, wait)) ?? stillRunning(stepId);
  }

  const { stepId, approvalId } = await stepWithApproval(
    ctx,
    ref,
    {
      kind: "COMMAND",
      title: host!.name,
      command,
      hostId: host!.id,
      input: { host: host!.name, reason: args.reason, decision: "approval" },
    },
    {
      kind: "INFRA_COMMAND",
      command,
      host: host!,
      reason: args.reason,
      riskFlags: decision.riskFlags,
    },
  );
  return (
    (await waitForApprovalAndStep(run, approvalId, stepId, wait)) ?? {
      status: "pending_approval",
      approval_id: approvalId,
      message:
        "A person has to approve this. Call infra_wait with this approval_id to keep waiting; don't retry the command.",
    }
  );
}

function denyMessage(reason: string): string {
  switch (reason) {
    case "host_not_allowed":
      return "Refused: that host isn't on the allowlist. Call list_hosts for the hosts you may use.";
    case "host_disabled":
      return "Refused: that host is disabled.";
    case "denied_by_rule":
      return "Refused: a DENY rule blocks this command. It can't run, not even with approval.";
    case "invalid_command":
      return "Refused: send exactly one non-empty command line of at most 4000 characters.";
    default:
      return `Refused: ${reason}.`;
  }
}

const stillRunning = (stepId: string): ToolResult => ({
  status: "running",
  step_id: stepId,
  message:
    "The command is still running. Report that to the person; its output will appear on the run.",
});

type StepRow = {
  status: string;
  exitCode: number | null;
  output: string | null;
  outputTruncated: boolean;
};

function stepResult(step: StepRow): ToolResult {
  const output = step.output ?? "";
  const truncated = step.outputTruncated || output.length > OUTPUT_FOR_MODEL;
  return {
    status:
      step.status === "SUCCEEDED"
        ? "completed"
        : step.status === "DENIED"
          ? "denied"
          : step.status === "CANCELLED"
            ? "cancelled"
            : "failed",
    exit_code: step.exitCode,
    output: truncated ? `${output.slice(0, OUTPUT_FOR_MODEL)}\n[output truncated]` : output,
  };
}

async function waitForStep(run: McpRun, stepId: string, wait: WaitOptions) {
  return waitFor({
    workspaceId: run.workspaceId,
    wake: (msg) =>
      msg.topic === `agent:${run.workspaceId}` &&
      (msg.payload as { stepId?: string } | null)?.stepId === stepId,
    check: async () => {
      const step = await db.agentRunStep.findUnique({
        where: { id: stepId },
        select: { status: true, exitCode: true, output: true, outputTruncated: true },
      });
      if (!step || step.status === "RUNNING") return null;
      return stepResult(step);
    },
    timeoutMs: TOOL_WAIT_MS,
    ...wait,
  });
}

async function waitForApprovalAndStep(
  run: McpRun,
  approvalId: string,
  stepId: string,
  wait: WaitOptions,
): Promise<ToolResult | null> {
  return waitFor({
    workspaceId: run.workspaceId,
    wake: (msg) => {
      const p = msg.payload as { stepId?: string; approvalId?: string; runId?: string } | null;
      return (
        msg.topic === `agent:${run.workspaceId}` &&
        (p?.stepId === stepId || p?.approvalId === approvalId || p?.runId === run.id)
      );
    },
    check: async () => {
      const approval = await db.agentApproval.findUnique({
        where: { id: approvalId },
        select: {
          status: true,
          decisionNote: true,
          decidedBy: { select: { name: true } },
          step: {
            select: { status: true, exitCode: true, output: true, outputTruncated: true },
          },
        },
      });
      if (!approval) return { status: "failed", message: "The approval no longer exists." };
      switch (approval.status) {
        case "PENDING":
          return null;
        case "DENIED":
          return {
            status: "denied",
            message: `DENIED by ${approval.decidedBy?.name ?? "a teammate"}${approval.decisionNote ? `: ${approval.decisionNote}` : ""}`,
          };
        case "EXPIRED":
          return {
            status: "expired",
            message: "Nobody approved this in time. Don't retry it; tell the person.",
          };
        case "CANCELLED":
          return { status: "cancelled", message: "The run was stopped." };
        case "APPROVED":
          if (!approval.step || approval.step.status === "RUNNING") return null;
          return stepResult(approval.step);
      }
    },
    timeoutMs: TOOL_WAIT_MS,
    ...wait,
  });
}

/**
 * `infra_wait`: keeps waiting on an approval this run opened. For a gated
 * MCP write, the approved write is performed here if the original call
 * already gave up (`performWrite`).
 */
export async function infraWait(
  principal: McpPrincipal,
  run: McpRun,
  approvalId: string,
  wait: WaitOptions,
  performWrite: (approval: {
    toolName: string;
    toolArgs: unknown;
    stepId: string;
  }) => Promise<ToolResult>,
): Promise<ToolResult> {
  const approval = await db.agentApproval.findUnique({
    where: { id: approvalId },
    select: { runId: true, stepId: true, kind: true, toolName: true, toolArgs: true },
  });
  if (!approval || approval.runId !== run.id || !approval.stepId)
    throw new McpError("not_found", "No such approval in this run.");
  if (approval.kind === "MCP_WRITE") {
    const decided = await waitForDecision(run, approvalId, wait);
    if (!decided) return { status: "pending_approval", approval_id: approvalId };
    if (decided.status !== "APPROVED") return decided.result;
    return performWrite({
      toolName: approval.toolName ?? "",
      toolArgs: approval.toolArgs,
      stepId: approval.stepId,
    });
  }
  return (
    (await waitForApprovalAndStep(run, approvalId, approval.stepId, wait)) ?? {
      status: "pending_approval",
      approval_id: approvalId,
    }
  );
}

/** Waits for a decision only (MCP writes run in the web process, not the worker). */
export async function waitForDecision(run: McpRun, approvalId: string, wait: WaitOptions) {
  return waitFor({
    workspaceId: run.workspaceId,
    wake: (msg) =>
      msg.topic === `agent:${run.workspaceId}` &&
      (msg.payload as { approvalId?: string } | null)?.approvalId === approvalId,
    check: async () => {
      const a = await db.agentApproval.findUnique({
        where: { id: approvalId },
        select: { status: true, decisionNote: true, decidedBy: { select: { name: true } } },
      });
      if (!a || a.status === "PENDING") return null;
      const result: ToolResult =
        a.status === "DENIED"
          ? {
              status: "denied",
              message: `DENIED by ${a.decidedBy?.name ?? "a teammate"}${a.decisionNote ? `: ${a.decisionNote}` : ""}`,
            }
          : a.status === "EXPIRED"
            ? { status: "expired", message: "Nobody approved this in time." }
            : a.status === "CANCELLED"
              ? { status: "cancelled", message: "The run was stopped." }
              : { status: "approved" };
      return { status: a.status, result };
    },
    timeoutMs: TOOL_WAIT_MS,
    ...wait,
  });
}

/**
 * Claims a gated write's step before performing it, so a write approved
 * once runs once even if the original call and infra_wait both see it.
 */
export async function claimStep(stepId: string): Promise<boolean> {
  const n = await db.$executeRaw`
    UPDATE agent_run_steps SET status = 'SUCCEEDED', "finishedAt" = now()
    WHERE id = ${stepId}::uuid AND status = 'RUNNING'`;
  return n === 1;
}

export async function finishToolStep(
  principal: McpPrincipal,
  run: McpRun,
  stepId: string,
  status: "SUCCEEDED" | "FAILED",
  output: string,
) {
  const ctx = agentCtx(principal, run.id);
  await withMutation(ctx, (m) =>
    finishStep(m.tx, (e) => m.emit(e), runRef(run), stepId, { status, output }),
  );
}

export { runRef, runRefSelect };
