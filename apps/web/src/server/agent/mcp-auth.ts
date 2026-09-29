import "server-only";
import { hashToken } from "@dopl/shared/crypto";
import { runTokenHash, type McpScope } from "@dopl/shared/domain/agent";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";

export interface McpPrincipal {
  tokenId: string;
  workspace: WorkspaceCtx["workspace"];
  agent: { userId: string; name: string; email: string; image: string | null };
  scopes: Set<McpScope>;
  /** Empty = every project the agent can see. */
  projectIds: string[];
}

/**
 * `Authorization: Bearer dopl_mcp_…` (D-032): an unrevoked, unexpired MCP
 * token whose user is an active AGENT member. Anything else is 401.
 */
export async function authenticateMcp(header: string | null): Promise<McpPrincipal | null> {
  const match = header?.match(/^Bearer\s+(\S{20,300})$/i);
  if (!match?.[1]) return null;
  const token = await db.apiToken.findUnique({
    where: { tokenHash: hashToken(match[1]) },
    select: {
      id: true,
      kind: true,
      scopes: true,
      projectIds: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
      workspace: {
        select: { id: true, slug: true, name: true, timezone: true, weekStartsOn: true },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          kind: true,
          memberships: { where: { status: "ACTIVE" }, select: { workspaceId: true } },
        },
      },
    },
  });
  if (!token || token.kind !== "MCP" || token.revokedAt) return null;
  if (token.expiresAt && token.expiresAt < new Date()) return null;
  if (token.user.kind !== "AGENT") return null;
  if (!token.user.memberships.some((m) => m.workspaceId === token.workspace.id)) return null;
  // At most one write a minute per token.
  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60_000)
    await db.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  return {
    tokenId: token.id,
    workspace: token.workspace,
    agent: {
      userId: token.user.id,
      name: token.user.name,
      email: token.user.email,
      image: token.user.image,
    },
    scopes: new Set(token.scopes as McpScope[]),
    projectIds: token.projectIds,
  };
}

export class McpError extends Error {
  constructor(
    readonly code:
      | "invalid_run_token"
      | "run_not_active"
      | "agent_paused"
      | "missing_scope"
      | "not_found"
      | "forbidden"
      | "invalid_input",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const runSelect = {
  id: true,
  workspaceId: true,
  agentUserId: true,
  status: true,
  untrusted: true,
  untrustedReasons: true,
  workItemId: true,
  channelId: true,
  triggeredById: true,
} as const;

/**
 * The run behind a `run_token`: it must belong to this token's agent and be
 * running (red team 7: a finished run's token is useless). The workspace
 * must not be paused (red team 4).
 */
export async function resolveRun(principal: McpPrincipal, runToken: string) {
  const run = await db.agentRun.findUnique({
    where: { runTokenHash: runTokenHash(runToken) },
    select: runSelect,
  });
  if (!run || run.agentUserId !== principal.agent.userId || run.workspaceId !== principal.workspace.id)
    throw new McpError("invalid_run_token");
  if (run.status !== "RUNNING" && run.status !== "WAITING_FOR_APPROVAL")
    throw new McpError("run_not_active", `This run is ${run.status.toLowerCase()}.`);
  const ws = await db.workspace.findUniqueOrThrow({
    where: { id: run.workspaceId },
    select: { agentPausedAt: true },
  });
  if (ws.agentPausedAt) throw new McpError("agent_paused", "The AI teammate is paused.");
  return run;
}
export type McpRun = Awaited<ReturnType<typeof resolveRun>>;

/** The agent as a workspace actor, so MCP writes reuse the normal services. */
export function agentCtx(principal: McpPrincipal, runId: string): WorkspaceCtx {
  return {
    actor: {
      userId: principal.agent.userId,
      name: principal.agent.name,
      email: principal.agent.email,
      image: principal.agent.image,
      kind: "AGENT",
      twoFactorEnabled: false,
    },
    workspace: principal.workspace,
    role: "MEMBER",
    canApproveAgentActions: false,
    policyActor: {
      userId: principal.agent.userId,
      kind: "AGENT",
      workspaceRole: "MEMBER",
      canApproveAgentActions: false,
    },
    agentRunId: runId,
  };
}

export function requireScope(principal: McpPrincipal, scope: McpScope) {
  if (!principal.scopes.has(scope))
    throw new McpError("missing_scope", `This token lacks the ${scope} scope.`);
}

export function requireProject(principal: McpPrincipal, projectId: string) {
  if (principal.projectIds.length > 0 && !principal.projectIds.includes(projectId))
    throw new McpError("forbidden", "This token isn't allowed in that project.");
}
