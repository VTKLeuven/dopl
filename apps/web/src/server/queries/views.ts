import "server-only";
import { canView } from "@dopl/shared/policy";
import { parseFilter, type FilterGroup } from "@dopl/shared/schemas/filters";
import {
  DisplayOptionsSchema,
  defaultDisplayOptions,
  type DisplayOptions,
} from "@dopl/shared/schemas/view";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere, projectAccessById } from "./projects";

export interface ViewSummary {
  id: string;
  name: string;
  description: string | null;
  projectId: string | null;
  visibility: "PRIVATE" | "WORKSPACE";
  isLocked: boolean;
  layout: DisplayOptions["layout"];
  owner: { id: string; name: string; image: string | null };
  favorite: boolean;
  updatedAt: string;
  can: { edit: boolean; delete: boolean; lock: boolean };
}

export interface ViewDetail extends ViewSummary {
  filters: FilterGroup;
  displayOptions: DisplayOptions;
}

const select = {
  id: true,
  name: true,
  description: true,
  projectId: true,
  visibility: true,
  isLocked: true,
  layout: true,
  ownerId: true,
  filters: true,
  displayOptions: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, image: true } },
} as const;

type Row = Awaited<ReturnType<typeof db.view.findMany<{ select: typeof select }>>>[number];

function toDetail(ctx: WorkspaceCtx, v: Row, favorites: Set<string>): ViewDetail {
  const parsed = DisplayOptionsSchema.safeParse(v.displayOptions);
  return {
    id: v.id,
    name: v.name,
    description: v.description,
    projectId: v.projectId,
    visibility: v.visibility,
    isLocked: v.isLocked,
    layout: v.layout,
    owner: v.owner,
    favorite: favorites.has(v.id),
    updatedAt: v.updatedAt.toISOString(),
    can: {
      edit: canView(ctx.policyActor, v, "view.edit"),
      delete: canView(ctx.policyActor, v, "view.delete"),
      lock: canView(ctx.policyActor, v, "view.lock"),
    },
    filters: parseFilter(v.filters),
    displayOptions: parsed.success ? parsed.data : defaultDisplayOptions,
  };
}

async function favoriteIds(ctx: WorkspaceCtx): Promise<Set<string>> {
  const favs = await db.favorite.findMany({
    where: { userId: ctx.actor.userId, entityType: "VIEW" },
    select: { entityId: true },
  });
  return new Set(favs.map((f) => f.entityId));
}

/** Views the actor can see: their own plus shared ones, for a project or the workspace. */
export async function listViews(
  ctx: WorkspaceCtx,
  projectId: string | null,
): Promise<ViewSummary[]> {
  const [rows, favs] = await Promise.all([
    db.view.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        projectId,
        deletedAt: null,
        OR: [{ ownerId: ctx.actor.userId }, { visibility: "WORKSPACE" }],
      },
      orderBy: { sortKey: "asc" },
      select,
    }),
    favoriteIds(ctx),
  ]);
  return rows.map((r) => {
    const detail: Partial<ViewDetail> = toDetail(ctx, r, favs);
    delete detail.filters;
    delete detail.displayOptions;
    return detail as ViewSummary;
  });
}

export async function getView(ctx: WorkspaceCtx, id: string): Promise<ViewDetail> {
  const [v, favs] = await Promise.all([
    db.view.findFirst({ where: { id, workspaceId: ctx.workspace.id, deletedAt: null }, select }),
    favoriteIds(ctx),
  ]);
  if (!v || !canView(ctx.policyActor, v, "view.see")) throw new NotFoundError();
  if (v.projectId) {
    const access = await projectAccessById(ctx, v.projectId);
    if (!access.can("project.view")) throw new NotFoundError();
  }
  return toDetail(ctx, v, favs);
}

export interface SidebarView {
  id: string;
  name: string;
  href: string;
  project: { identifier: string; name: string; color: string | null } | null;
}

/** Favourited views for the sidebar, skipping any the actor lost access to. */
export async function listFavoriteViews(ctx: WorkspaceCtx): Promise<SidebarView[]> {
  const favs = await db.favorite.findMany({
    where: { userId: ctx.actor.userId, workspaceId: ctx.workspace.id, entityType: "VIEW" },
    orderBy: { sortKey: "asc" },
    select: { entityId: true },
  });
  if (favs.length === 0) return [];
  const views = await db.view.findMany({
    where: {
      id: { in: favs.map((f) => f.entityId) },
      deletedAt: null,
      OR: [{ ownerId: ctx.actor.userId }, { visibility: "WORKSPACE" }],
      AND: [{ OR: [{ projectId: null }, { project: accessibleProjectsWhere(ctx) }] }],
    },
    select: {
      id: true,
      name: true,
      project: { select: { identifier: true, name: true, color: true } },
    },
  });
  const byId = new Map(views.map((v) => [v.id, v]));
  return favs.flatMap((f) => {
    const v = byId.get(f.entityId);
    if (!v) return [];
    return [
      {
        id: v.id,
        name: v.name,
        project: v.project,
        href: v.project
          ? `/${ctx.workspace.slug}/p/${v.project.identifier}/views/${v.id}`
          : `/${ctx.workspace.slug}/views/${v.id}`,
      },
    ];
  });
}
