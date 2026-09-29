import "server-only";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere } from "./projects";

export interface PaletteData {
  me: string;
  projects: Array<{ id: string; identifier: string; name: string; color: string | null }>;
  views: Array<{ id: string; name: string; href: string; projectName: string | null }>;
  members: Array<{ id: string; name: string; email: string; image: string | null }>;
  recents: Array<{
    type: "item" | "project" | "view";
    id: string;
    label: string;
    detail: string | null;
    href: string;
  }>;
}

/** Everything ⌘K lists without a server round-trip per keystroke. */
export async function getPaletteData(ctx: WorkspaceCtx): Promise<PaletteData> {
  const ws = ctx.workspace.slug;
  const projectWhere = { ...accessibleProjectsWhere(ctx), archivedAt: null };
  const guest = ctx.role === "GUEST";
  const [projects, views, members, visits] = await Promise.all([
    db.project.findMany({
      where: projectWhere,
      select: { id: true, identifier: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    guest
      ? Promise.resolve([])
      : db.view.findMany({
          where: {
            workspaceId: ctx.workspace.id,
            deletedAt: null,
            OR: [{ ownerId: ctx.actor.userId }, { visibility: "WORKSPACE" }],
            AND: [{ OR: [{ projectId: null }, { project: projectWhere }] }],
          },
          select: {
            id: true,
            name: true,
            project: { select: { identifier: true, name: true } },
          },
          orderBy: { name: "asc" },
          take: 200,
        }),
    guest
      ? Promise.resolve([])
      : db.workspaceMember.findMany({
          where: { workspaceId: ctx.workspace.id, status: "ACTIVE", role: { not: "GUEST" } },
          select: { user: { select: { id: true, name: true, email: true, image: true } } },
          orderBy: { user: { name: "asc" } },
        }),
    db.recentVisit.findMany({
      where: { userId: ctx.actor.userId, workspaceId: ctx.workspace.id },
      orderBy: { visitedAt: "desc" },
      take: 20,
      select: { entityType: true, entityId: true },
    }),
  ]);

  const viewHref = (v: (typeof views)[number]) =>
    v.project ? `/${ws}/p/${v.project.identifier}/views/${v.id}` : `/${ws}/views/${v.id}`;
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const viewById = new Map(views.map((v) => [v.id, v]));
  const itemIds = visits.filter((v) => v.entityType === "WORK_ITEM").map((v) => v.entityId);
  const items = itemIds.length
    ? await db.workItem.findMany({
        where: { id: { in: itemIds }, deletedAt: null, project: projectWhere },
        select: {
          id: true,
          title: true,
          sequence: true,
          project: { select: { identifier: true } },
        },
      })
    : [];
  const itemById = new Map(items.map((i) => [i.id, i]));

  // Visits to things the actor can no longer see simply drop out.
  const recents: PaletteData["recents"] = [];
  for (const v of visits) {
    if (v.entityType === "WORK_ITEM") {
      const i = itemById.get(v.entityId);
      if (!i) continue;
      const identifier = formatIdentifier(i.project.identifier, i.sequence);
      recents.push({
        type: "item",
        id: i.id,
        label: i.title,
        detail: identifier,
        href: `/${ws}/i/${identifier}`,
      });
    } else if (v.entityType === "PROJECT") {
      const p = projectById.get(v.entityId);
      if (p)
        recents.push({
          type: "project",
          id: p.id,
          label: p.name,
          detail: p.identifier,
          href: `/${ws}/p/${p.identifier}/items`,
        });
    } else if (v.entityType === "VIEW") {
      const view = viewById.get(v.entityId);
      if (view)
        recents.push({
          type: "view",
          id: view.id,
          label: view.name,
          detail: view.project?.name ?? null,
          href: viewHref(view),
        });
    }
    if (recents.length >= 8) break;
  }

  return {
    me: ctx.actor.userId,
    projects,
    views: views.map((v) => ({
      id: v.id,
      name: v.name,
      href: viewHref(v),
      projectName: v.project?.name ?? null,
    })),
    members: members.map((m) => m.user),
    recents,
  };
}
