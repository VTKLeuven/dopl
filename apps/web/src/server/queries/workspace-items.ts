import "server-only";
import { ForbiddenError } from "@dopl/shared/policy";
import type { ProjectMeta } from "@/features/work-items/types";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere } from "./projects";
import { listItems, WORKSPACE_ITEMS_LIMIT, type ItemsQuery } from "./work-items";

/**
 * Cross-project ("workspace") views. Guests never get these: their access is
 * per project and may exclude browsing, so they stay inside project pages.
 */
function assertNotGuest(ctx: WorkspaceCtx) {
  if (ctx.role === "GUEST") throw new ForbiddenError();
}

export async function workspaceProjects(ctx: WorkspaceCtx) {
  assertNotGuest(ctx);
  return db.project.findMany({
    where: { ...accessibleProjectsWhere(ctx), archivedAt: null },
    select: { id: true, identifier: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
}

export async function listWorkspaceItems(ctx: WorkspaceCtx, query: ItemsQuery) {
  return listItems(ctx, await workspaceProjects(ctx), query, { limit: WORKSPACE_ITEMS_LIMIT });
}

/**
 * ProjectMeta-shaped metadata for every project the actor can see, so the same
 * views and pickers work across projects. States and labels carry their
 * projectId; pickers narrow them to the row's project.
 */
export async function getWorkspaceMeta(ctx: WorkspaceCtx): Promise<ProjectMeta> {
  const projects = await workspaceProjects(ctx);
  const ids = projects.map((p) => p.id);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const [states, labels, types, members] = await Promise.all([
    db.workflowState.findMany({
      where: { projectId: { in: ids }, group: { not: "TRIAGE" } },
      orderBy: [{ projectId: "asc" }, { sortKey: "asc" }],
      select: {
        id: true,
        name: true,
        group: true,
        color: true,
        sortKey: true,
        isDefault: true,
        projectId: true,
      },
    }),
    db.label.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        OR: [{ projectId: null }, { projectId: { in: ids } }],
      },
      orderBy: { sortKey: "asc" },
      select: { id: true, name: true, color: true, projectId: true },
    }),
    db.workItemType.findMany({
      where: { workspaceId: ctx.workspace.id, archivedAt: null, projectId: null },
      orderBy: { sortKey: "asc" },
      select: { id: true, name: true, icon: true, color: true, isDefault: true },
    }),
    db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id, status: "ACTIVE", role: { not: "GUEST" } },
      select: { user: { select: { id: true, name: true, email: true, image: true, kind: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  return {
    project: {
      id: "",
      identifier: "",
      name: ctx.workspace.name,
      color: null,
      estimateSystem: "POINTS",
    },
    projects,
    states: states.map((s) => ({ ...s, projectName: names.get(s.projectId) })),
    labels,
    types,
    members: members.map((m) => m.user),
    // Each write is still checked per item on the server.
    can: { create: false, edit: true, delete: true, manage: false, comment: true },
    me: ctx.actor.userId,
    calendar: { timeZone: ctx.workspace.timezone, weekStartsOn: ctx.workspace.weekStartsOn },
  };
}
