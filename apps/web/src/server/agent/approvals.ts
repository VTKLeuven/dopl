import "server-only";
import type { ApprovalKind, Prisma } from "@dopl/db";
import {
  approverIds,
  createStep,
  emitAgentEvent,
  runRefSelect,
  syncWaitingStatus,
  type RunRef,
} from "@dopl/server/agent";
import { audit, withMutation, type Mutation } from "../mutation";
import { notifyApprovalRequested } from "../notifications/hooks";
import type { WorkspaceCtx } from "../session";

export interface ApprovalRequest {
  kind: ApprovalKind;
  /** The exact command, or a rendering of the tool call, shown to approvers. */
  command: string;
  host?: { id: string; name: string; warpgateTarget: string; environment: string } | null;
  toolName?: string | null;
  toolArgs?: Prisma.InputJsonValue;
  /** The agent's words: untrusted, shown as such. */
  reason?: string | null;
  riskFlags: string[];
  /** The step this approval gates (COMMAND or TOOL_CALL). */
  stepId: string;
  runtimeRequestId?: string | null;
}

/**
 * Opens an approval inside the agent's mutation: the run waits, approvers
 * get an Inbox notification and a realtime badge, and the request is
 * audit-logged. Returns the approval id.
 */
export async function openApproval(
  m: Mutation,
  run: RunRef & { untrusted: boolean },
  req: ApprovalRequest,
): Promise<string> {
  const { tx } = m;
  const profile = await tx.agentProfile.findFirst({
    where: { user: { agentRunsAsAgent: { some: { id: run.id } } } },
    select: { approvalTimeoutSec: true },
  });
  const expiresAt = new Date(Date.now() + (profile?.approvalTimeoutSec ?? 3600) * 1000);
  const approval = await tx.agentApproval.create({
    data: {
      workspaceId: run.workspaceId,
      runId: run.id,
      stepId: req.stepId,
      kind: req.kind,
      command: req.command,
      hostId: req.host?.id ?? null,
      hostSnapshot: req.host
        ? {
            name: req.host.name,
            warpgateTarget: req.host.warpgateTarget,
            environment: req.host.environment,
          }
        : undefined,
      toolName: req.toolName ?? null,
      toolArgs: req.toolArgs,
      agentReason: req.reason?.slice(0, 1000) ?? null,
      riskFlags: req.riskFlags,
      runtimeRequestId: req.runtimeRequestId ?? null,
      expiresAt,
    },
    select: { id: true },
  });
  const emit = (e: Parameters<Mutation["emit"]>[0]) => m.emit(e);
  await syncWaitingStatus(tx, emit, run);
  const item = run.workItemId
    ? await tx.workItem.findUnique({ where: { id: run.workItemId }, select: { projectId: true } })
    : null;
  await notifyApprovalRequested(m, {
    recipientIds: await approverIds(tx, run.workspaceId),
    approvalId: approval.id,
    runId: run.id,
    workItemId: run.workItemId,
    projectId: item?.projectId ?? null,
    command: req.command,
    host: req.host?.name ?? req.toolName ?? "",
  });
  await audit(tx, m.ctx, {
    action: "agent.approval.requested",
    targetType: "agent_approval",
    targetId: approval.id,
    metadata: {
      runId: run.id,
      kind: req.kind,
      command: req.command,
      host: req.host?.name ?? null,
      riskFlags: req.riskFlags,
    },
  });
  await emitAgentEvent(emit, run, "agentApproval.created", { approvalId: approval.id });
  return approval.id;
}

/** A step plus an approval for it, in one agent mutation. */
export async function stepWithApproval(
  ctx: WorkspaceCtx,
  run: RunRef & { untrusted: boolean },
  step: Parameters<typeof createStep>[3],
  req: Omit<ApprovalRequest, "stepId">,
) {
  return withMutation(ctx, async (m) => {
    const s = await createStep(m.tx, (e) => m.emit(e), run, step);
    const approvalId = await openApproval(m, run, { ...req, stepId: s.id });
    return { stepId: s.id, approvalId };
  });
}

export { runRefSelect };
