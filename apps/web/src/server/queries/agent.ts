import "server-only";
import type { Prisma } from "@dopl/db";
import {
  canApproveAgentAction,
  canStopAgentRun,
  canWorkspace,
  ForbiddenError,
} from "@dopl/shared/policy";
import { skipsApprovals, type AuditFilter } from "@dopl/shared/schemas/agent";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { NotFoundError } from "../action-result";
import { DEFAULT_CONTEXT_BUDGET, findAgent } from "../agent/runs";
import { db } from "../db";
import type { ConnectionCheck } from "../services/agent";
import type { WorkspaceCtx } from "../session";
import { channelAccessById } from "./channels";
import { accessibleProjectsWhere, projectAccessById } from "./projects";

/* ───────────────────────── views ───────────────────────── */

export type AgentRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_FOR_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "INTERRUPTED";

export interface AgentRunSummary {
  id: string;
  status: AgentRunStatus;
  trigger: string;
  triggeredBy: { id: string; name: string } | null;
  agentName: string;
  agentImage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  untrusted: boolean;
  untrustedReasons: string[];
  result: string | null;
  error: string | null;
  cancelReason: string | null;
  pendingApprovals: number;
  workItem: { id: string; identifier: string; title: string } | null;
  channel: { id: string; name: string | null; kind: string } | null;
}

export interface AgentApprovalView {
  id: string;
  kind: "INFRA_COMMAND" | "RUNTIME_TOOL" | "MCP_WRITE";
  status: "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "CANCELLED";
  command: string;
  host: { name: string; warpgateTarget: string; environment: string } | null;
  toolName: string | null;
  agentReason: string | null;
  riskFlags: string[];
  requestedAt: string;
  expiresAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface AgentStepView {
  id: string;
  seq: number;
  kind:
    "ASSISTANT_MESSAGE" | "TOOL_CALL" | "COMMAND" | "APPROVAL" | "STATUS" | "ERROR" | "SUBAGENT";
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "DENIED" | "CANCELLED";
  title: string | null;
  toolName: string | null;
  input: unknown;
  output: string | null;
  outputTruncated: boolean;
  command: string | null;
  exitCode: number | null;
  host: { name: string; environment: string } | null;
  startedAt: string;
  finishedAt: string | null;
  approval: AgentApprovalView | null;
}

export interface AgentRunDetail extends AgentRunSummary {
  prompt: string;
  steps: AgentStepView[];
  canStop: boolean;
  canApprove: boolean;
}

const summarySelect = {
  id: true,
  status: true,
  trigger: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  untrusted: true,
  untrustedReasons: true,
  result: true,
  error: true,
  cancelReason: true,
  workItemId: true,
  channelId: true,
  triggeredBy: { select: { id: true, name: true } },
  agentUser: { select: { name: true, image: true } },
  workItem: {
    select: {
      id: true,
      sequence: true,
      title: true,
      untrusted: true,
      project: { select: { identifier: true } },
    },
  },
  channel: { select: { id: true, name: true, kind: true, project: { select: { name: true } } } },
  _count: { select: { approvals: { where: { status: "PENDING" } } } },
} satisfies Prisma.AgentRunSelect;

type SummaryRow = Prisma.AgentRunGetPayload<{ select: typeof summarySelect }>;

function toSummary(r: SummaryRow): AgentRunSummary {
  return {
    id: r.id,
    status: r.status,
    trigger: r.trigger,
    triggeredBy: r.triggeredBy,
    agentName: r.agentUser.name,
    agentImage: r.agentUser.image,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    untrusted: r.untrusted,
    untrustedReasons: r.untrustedReasons,
    result: r.result,
    error: r.error,
    cancelReason: r.cancelReason,
    pendingApprovals: r._count.approvals,
    workItem: r.workItem
      ? {
          id: r.workItem.id,
          identifier: formatIdentifier(r.workItem.project.identifier, r.workItem.sequence),
          // Outside text never shows up out of its item's context.
          title: r.workItem.title,
        }
      : null,
    channel: r.channel
      ? {
          id: r.channel.id,
          name:
            r.channel.kind === "PROJECT"
              ? (r.channel.project?.name ?? r.channel.name)
              : r.channel.name,
          kind: r.channel.kind,
        }
      : null,
  };
}

const approvalSelect = {
  id: true,
  kind: true,
  status: true,
  command: true,
  hostSnapshot: true,
  toolName: true,
  agentReason: true,
  riskFlags: true,
  requestedAt: true,
  expiresAt: true,
  decidedAt: true,
  decisionNote: true,
  decidedBy: { select: { name: true } },
} satisfies Prisma.AgentApprovalSelect;

function toApproval(
  a: Prisma.AgentApprovalGetPayload<{ select: typeof approvalSelect }>,
): AgentApprovalView {
  return {
    id: a.id,
    kind: a.kind,
    status: a.status,
    command: a.command,
    host: (a.hostSnapshot as AgentApprovalView["host"]) ?? null,
    toolName: a.toolName,
    agentReason: a.agentReason,
    riskFlags: a.riskFlags,
    requestedAt: a.requestedAt.toISOString(),
    expiresAt: a.expiresAt.toISOString(),
    decidedBy: a.decidedBy?.name ?? null,
    decidedAt: a.decidedAt?.toISOString() ?? null,
    decisionNote: a.decisionNote,
  };
}

/* ───────────────────────── access ───────────────────────── */

/**
 * A run is visible to whoever can see where it happened: its item's
 * project, its channel, otherwise the requester and admins. Never guests.
 */
async function assertRunVisible(
  ctx: WorkspaceCtx,
  run: {
    workItemId: string | null;
    channelId: string | null;
    triggeredById: string | null;
    workItem: { projectId: string } | null;
  },
) {
  if (ctx.role === "GUEST" || ctx.actor.kind !== "HUMAN") throw new NotFoundError();
  if (run.workItem) {
    const access = await projectAccessById(ctx, run.workItem.projectId);
    if (!access.can("project.view")) throw new NotFoundError();
    return;
  }
  if (run.channelId) {
    await channelAccessById(ctx, run.channelId).catch(() => {
      throw new NotFoundError();
    });
    return;
  }
  if (run.triggeredById !== ctx.actor.userId && !canWorkspace(ctx.policyActor, "agent.manage"))
    throw new NotFoundError();
}

/* ───────────────────────── reads ───────────────────────── */

/** Runs about one work item, oldest first, for its timeline. */
export async function listRunsForItem(
  ctx: WorkspaceCtx,
  workItemId: string,
): Promise<AgentRunSummary[]> {
  if (ctx.role === "GUEST") return [];
  const rows = await db.agentRun.findMany({
    where: { workspaceId: ctx.workspace.id, workItemId },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: summarySelect,
  });
  return rows.map(toSummary);
}

/** Runs asked for in one chat channel (DMs with the agent, mentions). */
export async function listRunsForChannel(
  ctx: WorkspaceCtx,
  channelId: string,
): Promise<AgentRunSummary[]> {
  if (ctx.role === "GUEST") return [];
  await channelAccessById(ctx, channelId);
  const rows = await db.agentRun.findMany({
    where: { workspaceId: ctx.workspace.id, channelId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: summarySelect,
  });
  return rows.map(toSummary);
}

export async function getAgentRun(ctx: WorkspaceCtx, id: string): Promise<AgentRunDetail> {
  const run = await db.agentRun.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: {
      ...summarySelect,
      prompt: true,
      triggeredById: true,
      workItem: { select: { ...summarySelect.workItem.select, projectId: true } },
      steps: {
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          kind: true,
          status: true,
          title: true,
          toolName: true,
          input: true,
          output: true,
          outputTruncated: true,
          command: true,
          exitCode: true,
          startedAt: true,
          finishedAt: true,
          host: { select: { name: true, environment: true } },
          approval: { select: approvalSelect },
        },
      },
    },
  });
  if (!run) throw new NotFoundError();
  await assertRunVisible(ctx, run);
  return {
    ...toSummary(run),
    prompt: run.prompt,
    canStop: canStopAgentRun(ctx.policyActor, run),
    canApprove: canApproveAgentAction(ctx.policyActor),
    steps: run.steps.map((s) => ({
      id: s.id,
      seq: s.seq,
      kind: s.kind,
      status: s.status,
      title: s.title,
      toolName: s.toolName,
      input: s.input,
      output: s.output,
      outputTruncated: s.outputTruncated,
      command: s.command,
      exitCode: s.exitCode,
      host: s.host,
      startedAt: s.startedAt.toISOString(),
      finishedAt: s.finishedAt?.toISOString() ?? null,
      approval: s.approval ? toApproval(s.approval) : null,
    })),
  };
}

export interface PendingApproval extends AgentApprovalView {
  run: AgentRunSummary;
}

/**
 * The agent page: approvals waiting for someone and recent runs, limited
 * to what the viewer could see anyway.
 */
export async function listAgentActivity(ctx: WorkspaceCtx) {
  if (ctx.role === "GUEST") throw new ForbiddenError();
  const visible: Prisma.AgentRunWhereInput = {
    workspaceId: ctx.workspace.id,
    OR: [
      { workItem: { project: accessibleProjectsWhere(ctx) } },
      { channel: { members: { some: { userId: ctx.actor.userId } } } },
      { channel: { kind: "CUSTOM", isPrivate: false } },
      { channel: { kind: "PROJECT", project: accessibleProjectsWhere(ctx) } },
      ...(canWorkspace(ctx.policyActor, "agent.manage")
        ? [{ workItemId: null, channelId: null }]
        : []),
      { triggeredById: ctx.actor.userId },
    ],
  };
  const [pending, runs, paused, agent, profile] = await Promise.all([
    db.agentApproval.findMany({
      where: { workspaceId: ctx.workspace.id, status: "PENDING", run: visible },
      orderBy: { requestedAt: "asc" },
      take: 100,
      select: { ...approvalSelect, run: { select: summarySelect } },
    }),
    db.agentRun.findMany({
      where: visible,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: summarySelect,
    }),
    db.workspace.findUniqueOrThrow({
      where: { id: ctx.workspace.id },
      select: { agentPausedAt: true, agentPausedBy: { select: { name: true } } },
    }),
    findAgent(db, ctx.workspace.id),
    db.agentProfile.findFirst({
      where: { workspaceId: ctx.workspace.id },
      select: { settings: true },
    }),
  ]);
  return {
    /** Its chosen name and picture (D-133); null before one is added. */
    agent: agent ? { name: agent.name, image: agent.image } : null,
    /** Approvals switched off in Settings (D-140): everyone sees it on the agent page. */
    skipApprovals: skipsApprovals(profile?.settings),
    canApprove: canApproveAgentAction(ctx.policyActor),
    canPause: canWorkspace(ctx.policyActor, "agent.pause"),
    paused: paused.agentPausedAt
      ? { at: paused.agentPausedAt.toISOString(), by: paused.agentPausedBy?.name ?? null }
      : null,
    pending: pending.map((a) => ({ ...toApproval(a), run: toSummary(a.run) })) as PendingApproval[],
    runs: runs.map(toSummary),
  };
}
export type AgentActivity = Awaited<ReturnType<typeof listAgentActivity>>;

/** Pending approvals count for the sidebar badge (approvers only). */
export async function pendingApprovalCount(ctx: WorkspaceCtx): Promise<number> {
  if (!canApproveAgentAction(ctx.policyActor)) return 0;
  return db.agentApproval.count({ where: { workspaceId: ctx.workspace.id, status: "PENDING" } });
}

/* ───────────────────────── settings ───────────────────────── */

export async function getAgentSettings(ctx: WorkspaceCtx) {
  if (!canWorkspace(ctx.policyActor, "agent.manage")) throw new ForbiddenError();
  const [member, workspace, hosts, rules, tokens, projects] = await Promise.all([
    db.workspaceMember.findFirst({
      where: { workspaceId: ctx.workspace.id, status: "ACTIVE", user: { kind: "AGENT" } },
      orderBy: { joinedAt: "asc" },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            agentProfile: {
              select: {
                id: true,
                baseUrl: true,
                apiKeyEnv: true,
                model: true,
                instructions: true,
                status: true,
                runTimeoutSec: true,
                approvalTimeoutSec: true,
                settings: true,
              },
            },
          },
        },
      },
    }),
    db.workspace.findUniqueOrThrow({
      where: { id: ctx.workspace.id },
      select: { agentPausedAt: true, agentPausedBy: { select: { name: true } } },
    }),
    db.agentHost.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        hostname: true,
        warpgateTarget: true,
        environment: true,
        description: true,
        enabled: true,
        alwaysRequireApproval: true,
      },
    }),
    db.agentCommandRule.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        kind: true,
        pattern: true,
        description: true,
        hostId: true,
        enabled: true,
      },
    }),
    db.apiToken.findMany({
      where: { workspaceId: ctx.workspace.id, kind: "MCP" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        scopes: true,
        projectIds: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
    db.project.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, identifier: true, color: true },
    }),
  ]);
  const agent = member?.user ?? null;
  const p = agent?.agentProfile ?? null;
  const settings = (p?.settings ?? {}) as {
    contextBudgetChars?: number;
    lastCheck?: ConnectionCheck;
  };
  return {
    agent: agent ? { id: agent.id, name: agent.name, image: agent.image } : null,
    profile: p
      ? {
          id: p.id,
          baseUrl: p.baseUrl,
          apiKeyEnv: p.apiKeyEnv,
          model: p.model,
          instructions: p.instructions,
          status: p.status,
          runTimeoutSec: p.runTimeoutSec,
          approvalTimeoutSec: p.approvalTimeoutSec,
          contextBudgetChars: settings.contextBudgetChars ?? DEFAULT_CONTEXT_BUDGET,
          lastCheck: settings.lastCheck ?? null,
          skipApprovals: skipsApprovals(p.settings),
        }
      : null,
    paused: workspace.agentPausedAt
      ? { at: workspace.agentPausedAt.toISOString(), by: workspace.agentPausedBy?.name ?? null }
      : null,
    hosts,
    rules,
    tokens: tokens.map((t) => ({
      ...t,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      revokedAt: t.revokedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    projects,
  };
}
export type AgentSettings = Awaited<ReturnType<typeof getAgentSettings>>;

/* ───────────────────────── audit log ───────────────────────── */

export interface AuditRow {
  id: string;
  createdAt: string;
  actorType: string;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: unknown;
}

function auditWhere(ctx: WorkspaceCtx, f: AuditFilter): Prisma.AuditLogWhereInput {
  return {
    workspaceId: ctx.workspace.id,
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.actorId ? { actorId: f.actorId } : {}),
    ...(f.from || f.to
      ? {
          createdAt: {
            ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}),
            ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
  };
}

const auditSelect = {
  id: true,
  createdAt: true,
  actorType: true,
  actorId: true,
  actorLabel: true,
  action: true,
  targetType: true,
  targetId: true,
  ip: true,
  metadata: true,
} satisfies Prisma.AuditLogSelect;

const toAuditRow = (r: Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>): AuditRow => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
});

/** One page (newest first) with a cursor; admins only. */
export async function listAuditLogs(ctx: WorkspaceCtx, f: AuditFilter) {
  if (!canWorkspace(ctx.policyActor, "workspace.audit.view")) throw new ForbiddenError();
  const PAGE = 100;
  const rows = await db.auditLog.findMany({
    where: {
      ...auditWhere(ctx, f),
      ...(f.cursor ? { id: { lt: f.cursor } } : {}),
    },
    // uuidv7 ids are time-ordered, so id order is creation order.
    orderBy: { id: "desc" },
    take: PAGE + 1,
    select: auditSelect,
  });
  return {
    rows: rows.slice(0, PAGE).map(toAuditRow),
    nextCursor: rows.length > PAGE ? rows[PAGE - 1]!.id : null,
  };
}

/** Everything matching the filter, capped, for CSV/JSON export. */
export async function exportAuditLogs(ctx: WorkspaceCtx, f: AuditFilter, max = 50_000) {
  if (!canWorkspace(ctx.policyActor, "workspace.audit.view")) throw new ForbiddenError();
  const rows = await db.auditLog.findMany({
    where: auditWhere(ctx, f),
    orderBy: { id: "desc" },
    take: max,
    select: auditSelect,
  });
  return rows.map(toAuditRow);
}

/** Distinct actors and action prefixes for the filter menus. */
export async function auditFacets(ctx: WorkspaceCtx) {
  if (!canWorkspace(ctx.policyActor, "workspace.audit.view")) throw new ForbiddenError();
  const [actions, actors] = await Promise.all([
    db.auditLog.findMany({
      where: { workspaceId: ctx.workspace.id },
      distinct: ["action"],
      select: { action: true },
      take: 500,
    }),
    db.auditLog.findMany({
      where: { workspaceId: ctx.workspace.id, actorId: { not: null } },
      distinct: ["actorId"],
      select: { actorId: true, actorLabel: true },
      take: 200,
    }),
  ]);
  const prefixes = new Set<string>();
  for (const a of actions) {
    const parts = a.action.split(".");
    prefixes.add(parts[0]!);
    if (parts.length > 2) prefixes.add(parts.slice(0, 2).join("."));
  }
  return {
    actions: [...prefixes].sort(),
    actors: actors
      .filter((a) => a.actorId)
      .map((a) => ({ id: a.actorId!, label: a.actorLabel ?? a.actorId! })),
  };
}
