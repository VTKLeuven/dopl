import "server-only";
import type { Prisma } from "@dopl/db";
import {
  cancelRun,
  emitAgentEvent,
  finishStep,
  runRefSelect,
  syncWaitingStatus,
} from "@dopl/server/agent";
import { generateToken, hashToken } from "@dopl/shared/crypto";
import {
  evaluateInfraExec,
  MCP_TOKEN_PREFIX,
  normalizeCommand,
  ruleMatches,
} from "@dopl/shared/domain/agent";
import { uuidv7 } from "@dopl/shared/ids";
import {
  canApproveAgentAction,
  canStopAgentRun,
  canWorkspace,
  ForbiddenError,
} from "@dopl/shared/policy";
import {
  AgentHostSchema,
  AgentPauseSchema,
  AgentProfileSchema,
  AgentStatusSchema,
  ApprovalDecisionSchema,
  CommandRuleSchema,
  McpTokenSchema,
  RuleTestSchema,
  StopRunSchema,
} from "@dopl/shared/schemas/agent";
import { ConflictError, NotFoundError } from "../action-result";
import { DEFAULT_CONTEXT_BUDGET } from "../agent/runs";
import { waitFor } from "../agent/wait";
import { db } from "../db";
import { enqueue } from "../jobs";
import { audit, withMutation, type Mutation } from "../mutation";
import type { WorkspaceCtx } from "../session";

function assertManage(ctx: WorkspaceCtx) {
  if (!canWorkspace(ctx.policyActor, "agent.manage")) throw new ForbiddenError();
}

const emitOf = (m: Mutation) => (e: Parameters<Mutation["emit"]>[0]) => m.emit(e);

const settingsChanged = (m: Mutation) =>
  m.emit({ topic: `agent:${m.workspaceId}`, type: "agentSettings.updated", payload: {} });

/* ───────────────────────── the agent member ───────────────────────── */

/** Settings → AI teammate → "Add Dopl": the AGENT user, its membership and profile. */
export async function createAgent(ctx: WorkspaceCtx) {
  assertManage(ctx);
  return withMutation(ctx, async (m) => {
    const existing = await m.tx.workspaceMember.findFirst({
      where: { workspaceId: ctx.workspace.id, user: { kind: "AGENT" } },
      select: {
        userId: true,
        status: true,
        user: { select: { agentProfile: { select: { id: true } } } },
      },
    });
    let userId = existing?.userId;
    if (!userId) {
      const user = await m.tx.user.create({
        data: {
          email: `agent+${ctx.workspace.slug}@dopl.invalid`,
          name: "Dopl",
          kind: "AGENT",
          emailVerified: true,
        },
        select: { id: true },
      });
      userId = user.id;
      await m.tx.workspaceMember.create({
        data: { workspaceId: ctx.workspace.id, userId, role: "MEMBER", status: "ACTIVE" },
      });
    } else if (existing?.status !== "ACTIVE") {
      await m.tx.workspaceMember.updateMany({
        where: { workspaceId: ctx.workspace.id, userId },
        data: { status: "ACTIVE", deactivatedAt: null },
      });
    }
    if (!existing?.user.agentProfile)
      await m.tx.agentProfile.create({
        data: {
          workspaceId: ctx.workspace.id,
          userId,
          baseUrl: "http://hermes:8642",
          apiKeyEnv: "HERMES_API_KEY",
          model: null,
          status: "DISABLED",
          settings: { contextBudgetChars: DEFAULT_CONTEXT_BUDGET },
        },
      });
    await audit(m.tx, ctx, { action: "agent.created", targetType: "user", targetId: userId });
    settingsChanged(m);
    m.emit({ topic: `workspace:${ctx.workspace.id}`, type: "member.updated", payload: { userId } });
    return { userId };
  });
}

async function loadProfile(ctx: WorkspaceCtx) {
  const profile = await db.agentProfile.findFirst({
    where: { workspaceId: ctx.workspace.id },
    select: { id: true, userId: true, settings: true },
  });
  if (!profile) throw new NotFoundError();
  return profile;
}

export async function updateAgentProfile(ctx: WorkspaceCtx, raw: unknown) {
  assertManage(ctx);
  const input = AgentProfileSchema.parse(raw);
  const profile = await loadProfile(ctx);
  return withMutation(ctx, async (m) => {
    await m.tx.user.update({ where: { id: profile.userId }, data: { name: input.name } });
    await m.tx.agentProfile.update({
      where: { id: profile.id },
      data: {
        baseUrl: input.baseUrl,
        apiKeyEnv: input.apiKeyEnv,
        model: input.model || null,
        instructions: input.instructions || null,
        runTimeoutSec: input.runTimeoutSec,
        approvalTimeoutSec: input.approvalTimeoutSec,
        settings: {
          ...((profile.settings ?? {}) as Prisma.InputJsonObject),
          contextBudgetChars: input.contextBudgetChars,
        },
      },
    });
    await audit(m.tx, ctx, {
      action: "agent.settings.updated",
      targetType: "agent_profile",
      targetId: profile.id,
      metadata: {
        baseUrl: input.baseUrl,
        apiKeyEnv: input.apiKeyEnv,
        model: input.model ?? null,
        runTimeoutSec: input.runTimeoutSec,
        approvalTimeoutSec: input.approvalTimeoutSec,
        contextBudgetChars: input.contextBudgetChars,
        instructionsChanged: true,
      },
    });
    settingsChanged(m);
    return { id: profile.id };
  });
}

/** ACTIVE ↔ DISABLED: whether the agent takes requests at all. */
export async function setAgentStatus(ctx: WorkspaceCtx, raw: unknown) {
  assertManage(ctx);
  const { status } = AgentStatusSchema.parse(raw);
  const profile = await loadProfile(ctx);
  return withMutation(ctx, async (m) => {
    await m.tx.agentProfile.update({ where: { id: profile.id }, data: { status } });
    await audit(m.tx, ctx, {
      action: status === "ACTIVE" ? "agent.enabled" : "agent.disabled",
      targetType: "agent_profile",
      targetId: profile.id,
    });
    settingsChanged(m);
    return { status };
  });
}

/**
 * The global kill switch (ARCHITECTURE §8.4): no new runs, every active run
 * cancelled with its pending approvals, and the worker told to stop them
 * (red team 4). Resuming only allows new runs.
 */
export async function setAgentPaused(ctx: WorkspaceCtx, raw: unknown) {
  if (!canWorkspace(ctx.policyActor, "agent.pause")) throw new ForbiddenError();
  const { paused } = AgentPauseSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    await m.tx.workspace.update({
      where: { id: ctx.workspace.id },
      data: paused
        ? { agentPausedAt: new Date(), agentPausedById: ctx.actor.userId }
        : { agentPausedAt: null, agentPausedById: null },
    });
    let stopped = 0;
    if (paused) {
      const runs = await m.tx.agentRun.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          status: { in: ["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"] },
        },
        select: { ...runRefSelect, runtimeRunId: true },
      });
      for (const run of runs) {
        const done = await cancelRun(m.tx, emitOf(m), run, {
          reason: "agent_paused",
          cancelledById: ctx.actor.userId,
        });
        if (done) stopped++;
        if (done && run.runtimeRunId) await enqueue(m.tx, "agent.stop", { runId: run.id });
      }
    }
    await audit(m.tx, ctx, {
      action: paused ? "agent.paused" : "agent.resumed",
      targetType: "workspace",
      targetId: ctx.workspace.id,
      metadata: { stoppedRuns: stopped },
    });
    settingsChanged(m);
    return { paused, stoppedRuns: stopped };
  });
}

export interface ConnectionCheck {
  ok: boolean;
  model: string | null;
  missing: string[];
  approvals: boolean;
  error: string | null;
  at: string;
}

/** Asks the worker (which holds the runtime key) to call /v1/capabilities, and waits. */
export async function checkAgentConnection(ctx: WorkspaceCtx): Promise<ConnectionCheck> {
  assertManage(ctx);
  const profile = await loadProfile(ctx);
  const requestId = uuidv7();
  await db.$transaction((tx) => enqueue(tx, "agent.check", { profileId: profile.id, requestId }));
  const result = await waitFor({
    workspaceId: ctx.workspace.id,
    wake: (msg) => msg.type === "agentProfile.checked",
    check: async () => {
      const p = await db.agentProfile.findUnique({
        where: { id: profile.id },
        select: { settings: true },
      });
      const last = (p?.settings as { lastCheck?: ConnectionCheck & { requestId?: string } } | null)
        ?.lastCheck;
      return last?.requestId === requestId ? last : null;
    },
    timeoutMs: 20_000,
    pollMs: 1_000,
  });
  if (!result)
    return {
      ok: false,
      model: null,
      missing: [],
      approvals: false,
      error: "worker_timeout",
      at: new Date().toISOString(),
    };
  return result;
}

/* ───────────────────────── hosts and rules ───────────────────────── */

export async function upsertAgentHost(ctx: WorkspaceCtx, raw: unknown) {
  assertManage(ctx);
  const input = AgentHostSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const clash = await m.tx.agentHost.findFirst({
      where: {
        workspaceId: ctx.workspace.id,
        name: input.name,
        ...(input.id ? { id: { not: input.id } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictError("host_name_taken");
    const data = {
      name: input.name,
      hostname: input.hostname,
      warpgateTarget: input.warpgateTarget,
      environment: input.environment,
      description: input.description || null,
      enabled: input.enabled,
      alwaysRequireApproval: input.alwaysRequireApproval,
    };
    let id = input.id;
    if (id) {
      const n = await m.tx.agentHost.updateMany({
        where: { id, workspaceId: ctx.workspace.id },
        data,
      });
      if (!n.count) throw new NotFoundError();
    } else {
      id = (
        await m.tx.agentHost.create({
          data: { ...data, workspaceId: ctx.workspace.id, createdById: ctx.actor.userId },
          select: { id: true },
        })
      ).id;
    }
    await audit(m.tx, ctx, {
      action: input.id ? "agent.host.updated" : "agent.host.created",
      targetType: "agent_host",
      targetId: id,
      metadata: data,
    });
    settingsChanged(m);
    return { id };
  });
}

export async function deleteAgentHost(ctx: WorkspaceCtx, id: string) {
  assertManage(ctx);
  return withMutation(ctx, async (m) => {
    const host = await m.tx.agentHost.findFirst({
      where: { id, workspaceId: ctx.workspace.id },
      select: { id: true, name: true, warpgateTarget: true },
    });
    if (!host) throw new NotFoundError();
    await m.tx.agentHost.delete({ where: { id } });
    await audit(m.tx, ctx, {
      action: "agent.host.deleted",
      targetType: "agent_host",
      targetId: id,
      metadata: { name: host.name, warpgateTarget: host.warpgateTarget },
    });
    settingsChanged(m);
    return { id };
  });
}

export async function upsertCommandRule(ctx: WorkspaceCtx, raw: unknown) {
  assertManage(ctx);
  const input = CommandRuleSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    if (input.hostId) {
      const host = await m.tx.agentHost.findFirst({
        where: { id: input.hostId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });
      if (!host) throw new NotFoundError();
    }
    const data = {
      kind: input.kind,
      pattern: input.pattern,
      description: input.description || null,
      hostId: input.hostId,
      enabled: input.enabled,
    };
    let id = input.id;
    if (id) {
      const n = await m.tx.agentCommandRule.updateMany({
        where: { id, workspaceId: ctx.workspace.id },
        data,
      });
      if (!n.count) throw new NotFoundError();
    } else {
      id = (
        await m.tx.agentCommandRule.create({
          data: { ...data, workspaceId: ctx.workspace.id, createdById: ctx.actor.userId },
          select: { id: true },
        })
      ).id;
    }
    await audit(m.tx, ctx, {
      action: input.id ? "agent.rule.updated" : "agent.rule.created",
      targetType: "agent_command_rule",
      targetId: id,
      metadata: data,
    });
    settingsChanged(m);
    return { id };
  });
}

export async function deleteCommandRule(ctx: WorkspaceCtx, id: string) {
  assertManage(ctx);
  return withMutation(ctx, async (m) => {
    const rule = await m.tx.agentCommandRule.findFirst({
      where: { id, workspaceId: ctx.workspace.id },
      select: { id: true, kind: true, pattern: true },
    });
    if (!rule) throw new NotFoundError();
    await m.tx.agentCommandRule.delete({ where: { id } });
    await audit(m.tx, ctx, {
      action: "agent.rule.deleted",
      targetType: "agent_command_rule",
      targetId: id,
      metadata: { kind: rule.kind, pattern: rule.pattern },
    });
    settingsChanged(m);
    return { id };
  });
}

/** The rule tester in Settings: what would happen to this command on this host? */
export async function testCommand(ctx: WorkspaceCtx, raw: unknown) {
  assertManage(ctx);
  const input = RuleTestSchema.parse(raw);
  const [host, rules, workspace] = await Promise.all([
    input.hostId
      ? db.agentHost.findFirst({
          where: { id: input.hostId, workspaceId: ctx.workspace.id },
          select: { id: true, enabled: true, environment: true, alwaysRequireApproval: true },
        })
      : null,
    db.agentCommandRule.findMany({
      where: { workspaceId: ctx.workspace.id },
      select: { id: true, kind: true, pattern: true, hostId: true, enabled: true },
    }),
    db.workspace.findUniqueOrThrow({
      where: { id: ctx.workspace.id },
      select: { agentPausedAt: true },
    }),
  ]);
  const decision = evaluateInfraExec({
    paused: Boolean(workspace.agentPausedAt),
    runActive: true,
    host,
    rules,
    command: input.command,
    tainted: input.tainted,
  });
  const command = normalizeCommand(input.command);
  const matching = rules
    .filter((r) => r.enabled && (r.hostId === null || r.hostId === host?.id))
    .filter((r) => ruleMatches(r, command))
    .map((r) => r.id);
  return { decision, matchingRuleIds: matching };
}

/* ───────────────────────── MCP tokens ───────────────────────── */

/** Returns the plain token once; only its hash is stored. */
export async function createMcpToken(ctx: WorkspaceCtx, raw: unknown) {
  assertManage(ctx);
  const input = McpTokenSchema.parse(raw);
  const profile = await loadProfile(ctx);
  const token = `${MCP_TOKEN_PREFIX}${generateToken(32)}`;
  return withMutation(ctx, async (m) => {
    if (input.projectIds.length) {
      const n = await m.tx.project.count({
        where: { id: { in: input.projectIds }, workspaceId: ctx.workspace.id, deletedAt: null },
      });
      if (n !== new Set(input.projectIds).size) throw new ConflictError("invalid_project");
    }
    const row = await m.tx.apiToken.create({
      data: {
        workspaceId: ctx.workspace.id,
        userId: profile.userId,
        kind: "MCP",
        name: input.name,
        tokenPrefix: token.slice(0, MCP_TOKEN_PREFIX.length + 6),
        tokenHash: hashToken(token),
        scopes: input.scopes,
        projectIds: input.projectIds,
        expiresAt: input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 86_400_000)
          : null,
        createdById: ctx.actor.userId,
      },
      select: { id: true },
    });
    await audit(m.tx, ctx, {
      action: "agent.token.created",
      targetType: "api_token",
      targetId: row.id,
      metadata: { name: input.name, scopes: input.scopes, projectIds: input.projectIds },
    });
    settingsChanged(m);
    return { id: row.id, token };
  });
}

export async function revokeMcpToken(ctx: WorkspaceCtx, id: string) {
  assertManage(ctx);
  return withMutation(ctx, async (m) => {
    const n = await m.tx.apiToken.updateMany({
      where: { id, workspaceId: ctx.workspace.id, kind: "MCP", revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!n.count) throw new NotFoundError();
    await audit(m.tx, ctx, {
      action: "agent.token.revoked",
      targetType: "api_token",
      targetId: id,
    });
    settingsChanged(m);
    return { id };
  });
}

/* ───────────────────────── approvals and runs ───────────────────────── */

/**
 * Approve or deny (D-031). Logged with who and when. An approved command
 * goes to the worker, which checks the DENY rules again before running it
 * (red team 3); a denied one tells the agent who said no and why.
 */
export async function decideApproval(ctx: WorkspaceCtx, raw: unknown) {
  if (!canApproveAgentAction(ctx.policyActor)) throw new ForbiddenError();
  const input = ApprovalDecisionSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const approval = await m.tx.agentApproval.findFirst({
      where: { id: input.id, workspaceId: ctx.workspace.id },
      select: {
        id: true,
        kind: true,
        status: true,
        expiresAt: true,
        stepId: true,
        command: true,
        hostSnapshot: true,
        run: { select: { ...runRefSelect, status: true } },
      },
    });
    if (!approval) throw new NotFoundError();
    if (approval.status !== "PENDING")
      throw new ConflictError(`already_${approval.status.toLowerCase()}`);
    if (approval.expiresAt < new Date()) throw new ConflictError("expired");
    const approved = input.decision === "APPROVE";
    await m.tx.agentApproval.update({
      where: { id: approval.id },
      data: {
        status: approved ? "APPROVED" : "DENIED",
        decidedById: ctx.actor.userId,
        decidedAt: new Date(),
        decisionNote: input.note || null,
      },
    });
    const run = approval.run;
    if (approval.stepId) {
      if (!approved)
        await finishStep(m.tx, emitOf(m), run, approval.stepId, {
          status: "DENIED",
          output: `Denied by ${ctx.actor.name}${input.note ? `: ${input.note}` : "."}`,
        });
      else if (approval.kind === "INFRA_COMMAND")
        await enqueue(
          m.tx,
          "agent.exec",
          { stepId: approval.stepId },
          { singletonKey: approval.stepId },
        );
    }
    if (approval.kind === "RUNTIME_TOOL")
      await enqueue(m.tx, "agent.runtime-approval", { approvalId: approval.id });
    await syncWaitingStatus(m.tx, emitOf(m), run);
    // Everyone else's notification for this approval is done with.
    await m.tx.notification.updateMany({
      where: { agentApprovalId: approval.id, readAt: null },
      data: { readAt: new Date() },
    });
    await audit(m.tx, ctx, {
      action: approved ? "agent.approval.approved" : "agent.approval.denied",
      targetType: "agent_approval",
      targetId: approval.id,
      metadata: {
        runId: run.id,
        kind: approval.kind,
        command: approval.command,
        host: approval.hostSnapshot ?? null,
        note: input.note ?? null,
      },
    });
    await emitAgentEvent(emitOf(m), run, "agentApproval.decided", {
      approvalId: approval.id,
      status: approved ? "APPROVED" : "DENIED",
    });
    return { id: approval.id, status: approved ? "APPROVED" : "DENIED" };
  });
}

/** Stop on a run: cancel it here at once; the worker stops the runtime and any SSH channel. */
export async function stopAgentRun(ctx: WorkspaceCtx, raw: unknown) {
  const input = StopRunSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const run = await m.tx.agentRun.findFirst({
      where: { id: input.id, workspaceId: ctx.workspace.id },
      select: { ...runRefSelect, triggeredById: true, runtimeRunId: true },
    });
    if (!run) throw new NotFoundError();
    if (!canStopAgentRun(ctx.policyActor, run)) throw new ForbiddenError();
    const done = await cancelRun(m.tx, emitOf(m), run, {
      reason: input.reason || "stopped",
      cancelledById: ctx.actor.userId,
    });
    if (!done) return { id: run.id, stopped: false };
    if (run.runtimeRunId) await enqueue(m.tx, "agent.stop", { runId: run.id });
    await audit(m.tx, ctx, {
      action: "agent.run.stopped",
      targetType: "agent_run",
      targetId: run.id,
      metadata: { reason: input.reason ?? null },
    });
    return { id: run.id, stopped: true };
  });
}

/**
 * An admin read the outside content and vouches for it (D-033): the item
 * no longer taints runs. Audit-logged.
 */
export async function markItemReviewed(ctx: WorkspaceCtx, workItemId: string) {
  assertManage(ctx);
  return withMutation(ctx, async (m) => {
    const item = await m.tx.workItem.findFirst({
      where: { id: workItemId, workspaceId: ctx.workspace.id, deletedAt: null },
      select: { id: true, projectId: true, untrusted: true, origin: true },
    });
    if (!item) throw new NotFoundError();
    if (!item.untrusted) return { id: item.id };
    await m.tx.workItem.update({ where: { id: item.id }, data: { untrusted: false } });
    m.activity({
      entityType: "WORK_ITEM",
      entityId: item.id,
      workItemId: item.id,
      projectId: item.projectId,
      verb: "reviewed",
      meta: { origin: item.origin },
    });
    await audit(m.tx, ctx, {
      action: "work_item.untrusted_cleared",
      targetType: "work_item",
      targetId: item.id,
      metadata: { origin: item.origin },
    });
    m.emit({
      topic: `project:${item.projectId}`,
      type: "workItem.updated",
      payload: { id: item.id, fields: ["untrusted"] },
    });
    return { id: item.id };
  });
}
