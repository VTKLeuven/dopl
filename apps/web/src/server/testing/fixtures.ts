import type { WorkspaceRole } from "@dopl/shared/policy";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { createProject } from "../services/projects";

let n = 0;
const uniq = () =>
  `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A fresh, isolated workspace per test — no cleanup needed (see test/global-setup.ts). */
export async function makeWorkspace() {
  const slug = `t-${uniq()}`;
  const workspace = await db.workspace.create({ data: { slug, name: `Test ${slug}` } });
  await db.workItemType.create({
    data: {
      workspaceId: workspace.id,
      name: "Task",
      icon: "square-check",
      color: "grey",
      isDefault: true,
      sortKey: "a0",
    },
  });
  return workspace;
}

export async function makeMember(
  workspace: { id: string; slug: string; name: string; timezone: string; weekStartsOn: number },
  role: WorkspaceRole = "MEMBER",
  name = "Test User",
): Promise<WorkspaceCtx> {
  const user = await db.user.create({
    data: { email: `${uniq()}@dopl.test`, name, emailVerified: true },
  });
  await db.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role, status: "ACTIVE" },
  });
  return {
    actor: {
      userId: user.id,
      name,
      email: user.email,
      image: null,
      kind: "HUMAN",
      twoFactorEnabled: false,
    },
    workspace: {
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      timezone: workspace.timezone,
      weekStartsOn: workspace.weekStartsOn,
    },
    role,
    canApproveAgentActions: false,
    policyActor: {
      userId: user.id,
      kind: "HUMAN",
      workspaceRole: role,
      canApproveAgentActions: false,
    },
  };
}

export async function makeProject(
  ctx: WorkspaceCtx,
  // The tail of uniq() varies per call; its head is the (shared) timestamp.
  identifier = `P${uniq()
    .replace(/[^a-z0-9]/gi, "")
    .slice(-6)
    .toUpperCase()}`,
) {
  const p = await createProject(ctx, { name: `Project ${identifier}`, identifier });
  const states = await db.workflowState.findMany({
    where: { projectId: p.id },
    orderBy: { sortKey: "asc" },
  });
  const byName = (name: string) => {
    const s = states.find((x) => x.name === name);
    if (!s) throw new Error(`state ${name} missing`);
    return s;
  };
  return { ...p, states, byName };
}
