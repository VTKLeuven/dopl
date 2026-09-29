/**
 * AI teammate seed (Phase 8): the agent's profile, an allowlist of three
 * hosts, sensible default command rules, and — in dev and CI — an MCP token
 * for the fake Hermes the worker serves (HERMES_FAKE_PORT). Bram may
 * approve agent actions, so the e2e tests (signed in as Bram) can.
 */
import { createHash } from "node:crypto";
import type { DbClient } from "../client";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export const SEED_HOSTS = [
  {
    name: "lab-01",
    hostname: "lab-01.vtk.lan",
    warpgateTarget: "lab-01",
    environment: "LAB" as const,
    description: "Scratch VM for trying things out",
    alwaysRequireApproval: false,
  },
  {
    name: "staging-01",
    hostname: "staging-01.vtk.lan",
    warpgateTarget: "staging-01",
    environment: "STAGING" as const,
    description: "Staging copy of the website and Dopl",
    alwaysRequireApproval: false,
  },
  {
    name: "app-01",
    hostname: "app-01.vtk.be",
    warpgateTarget: "app-01",
    environment: "PRODUCTION" as const,
    description: "Production Docker host (website, Dopl, Garage)",
    alwaysRequireApproval: true,
  },
];

export const SEED_RULES = [
  { kind: "ALLOW_READONLY" as const, pattern: "uptime", description: "Load and uptime" },
  { kind: "ALLOW_READONLY" as const, pattern: "hostname|whoami", description: "Who and where" },
  { kind: "ALLOW_READONLY" as const, pattern: "df -h( [\\w/.-]+)?", description: "Disk usage" },
  { kind: "ALLOW_READONLY" as const, pattern: "free -[hm]", description: "Memory" },
  {
    kind: "ALLOW_READONLY" as const,
    pattern: "docker ps( -a)?( --format \\S+)?",
    description: "List containers",
  },
  {
    kind: "ALLOW_READONLY" as const,
    pattern: "docker logs --tail \\d{1,4} [\\w.-]+",
    description: "Recent container logs",
  },
  {
    kind: "ALLOW_READONLY" as const,
    pattern: "systemctl status [\\w@.-]+( --no-pager)?",
    description: "Service status",
  },
  {
    kind: "ALLOW_READONLY" as const,
    pattern: "journalctl -u [\\w@.-]+ -n \\d{1,4} --no-pager",
    description: "Recent service logs",
  },
  {
    kind: "DENY" as const,
    pattern: "rm -rf /.*|rm -rf \\*.*",
    description: "Recursive deletes from the root",
  },
  { kind: "DENY" as const, pattern: "mkfs(\\.\\w+)?( .*)?", description: "Formatting disks" },
  { kind: "DENY" as const, pattern: "dd .*of=/dev/.*", description: "Writing raw devices" },
  {
    kind: "DENY" as const,
    pattern: "(shutdown|poweroff|halt)( .*)?",
    description: "Powering hosts off",
  },
  {
    kind: "DENY" as const,
    pattern: "cat .*(\\.env|id_\\w+|\\.pem|shadow).*",
    description: "Reading secrets",
  },
];

export async function seedAgent(
  db: DbClient,
  opts: { workspaceId: string; agentUserId: string; approverEmails: string[] },
): Promise<{ hosts: number; rules: number; token: boolean }> {
  const port = process.env.HERMES_FAKE_PORT;
  await db.agentProfile.upsert({
    where: { userId: opts.agentUserId },
    create: {
      workspaceId: opts.workspaceId,
      userId: opts.agentUserId,
      baseUrl: `http://127.0.0.1:${port || "8642"}`,
      apiKeyEnv: "HERMES_API_KEY",
      model: "qwen3.8-27b",
      instructions:
        "Prefer read-only checks before changing anything. On production hosts, explain the change and its rollback before you run it.",
      status: "ACTIVE",
      settings: { contextBudgetChars: 60_000 },
    },
    update: port ? { baseUrl: `http://127.0.0.1:${port}` } : {},
  });

  await db.workspaceMember.updateMany({
    where: { workspaceId: opts.workspaceId, user: { email: { in: opts.approverEmails } } },
    data: { canApproveAgentActions: true },
  });

  const hostIds = new Map<string, string>();
  for (const h of SEED_HOSTS) {
    const row = await db.agentHost.upsert({
      where: { workspaceId_name: { workspaceId: opts.workspaceId, name: h.name } },
      create: { ...h, workspaceId: opts.workspaceId },
      update: {},
      select: { id: true },
    });
    hostIds.set(h.name, row.id);
  }
  const existing = await db.agentCommandRule.count({ where: { workspaceId: opts.workspaceId } });
  if (existing === 0)
    await db.agentCommandRule.createMany({
      data: SEED_RULES.map((r) => ({ ...r, workspaceId: opts.workspaceId, hostId: null })),
    });

  const token = process.env.HERMES_FAKE_MCP_TOKEN;
  if (token) {
    await db.apiToken.upsert({
      where: { tokenHash: hash(token) },
      create: {
        workspaceId: opts.workspaceId,
        userId: opts.agentUserId,
        kind: "MCP",
        name: "Fake Hermes (dev)",
        tokenPrefix: token.slice(0, 15),
        tokenHash: hash(token),
        scopes: [
          "work_items:read",
          "work_items:write",
          "comments:write",
          "email_threads:read_assigned",
          "infra:exec",
        ],
        projectIds: [],
      },
      update: { revokedAt: null, userId: opts.agentUserId, workspaceId: opts.workspaceId },
    });
  }
  return { hosts: SEED_HOSTS.length, rules: SEED_RULES.length, token: Boolean(token) };
}
