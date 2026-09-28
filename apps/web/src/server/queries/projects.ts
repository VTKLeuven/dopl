import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Prisma } from "@dopl/db";
import {
  canProject,
  effectiveProjectRole,
  ForbiddenError,
  type PolicyProject,
  type ProjectAction,
  type ProjectRole,
} from "@dopl/shared/policy";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";

/** Prisma filter for projects the actor may see (mirrors effectiveProjectRole). */
export function accessibleProjectsWhere(ctx: WorkspaceCtx): Prisma.ProjectWhereInput {
  const base: Prisma.ProjectWhereInput = { workspaceId: ctx.workspace.id, deletedAt: null };
  if (ctx.role === "OWNER" || ctx.role === "ADMIN") return base;
  if (ctx.role === "GUEST") return { ...base, members: { some: { userId: ctx.actor.userId } } };
  return {
    ...base,
    OR: [{ visibility: "WORKSPACE" }, { members: { some: { userId: ctx.actor.userId } } }],
  };
}

export interface ProjectAccess {
  project: {
    id: string;
    identifier: string;
    name: string;
    icon: string | null;
    color: string | null;
    visibility: "WORKSPACE" | "PRIVATE";
    guestsCanViewProject: boolean;
    estimateSystem: "NONE" | "POINTS" | "HOURS";
    archivedAt: Date | null;
    leadId: string | null;
    description: Prisma.JsonValue;
  };
  role: ProjectRole;
  policy: PolicyProject;
  can: (action: ProjectAction) => boolean;
}

/** Loads a project by identifier (INFRA) with the actor's permissions, or 404. */
export const getProjectAccess = cache(
  async (ctx: WorkspaceCtx, identifier: string): Promise<ProjectAccess> => {
    const project = await db.project.findFirst({
      where: { workspaceId: ctx.workspace.id, identifier: identifier.toUpperCase(), deletedAt: null },
      select: {
        id: true,
        identifier: true,
        name: true,
        icon: true,
        color: true,
        visibility: true,
        guestsCanViewProject: true,
        estimateSystem: true,
        archivedAt: true,
        leadId: true,
        description: true,
        members: { where: { userId: ctx.actor.userId }, select: { role: true } },
      },
    });
    if (!project) notFound();
    const policy: PolicyProject = {
      visibility: project.visibility,
      guestsCanViewProject: project.guestsCanViewProject,
      archivedAt: project.archivedAt,
      memberRole: project.members[0]?.role ?? null,
    };
    const role = effectiveProjectRole(ctx.policyActor, policy);
    // Invisible projects 404 rather than 403 so their existence doesn't leak.
    if (!role) notFound();
    const { members: _members, ...rest } = project;
    return { project: rest, role, policy, can: (a) => canProject(ctx.policyActor, policy, a) };
  },
);

export function assertProject(access: ProjectAccess, action: ProjectAction) {
  if (!access.can(action)) throw new ForbiddenError();
}

export async function listSidebarProjects(ctx: WorkspaceCtx) {
  const projects = await db.project.findMany({
    where: { ...accessibleProjectsWhere(ctx), archivedAt: null },
    select: {
      id: true,
      identifier: true,
      name: true,
      icon: true,
      color: true,
      members: { where: { userId: ctx.actor.userId }, select: { sortKey: true } },
    },
    orderBy: { name: "asc" },
  });
  return projects
    .map((p) => ({ id: p.id, identifier: p.identifier, name: p.name, icon: p.icon, color: p.color, sortKey: p.members[0]?.sortKey ?? null }))
    .sort((a, b) => (a.sortKey && b.sortKey ? (a.sortKey < b.sortKey ? -1 : 1) : a.sortKey ? -1 : b.sortKey ? 1 : 0));
}
export type SidebarProject = Awaited<ReturnType<typeof listSidebarProjects>>[number];
