import "server-only";
import { z } from "zod";
import { DEFAULT_HOME_LAYOUT, parseHomeLayout } from "@dopl/shared/domain/home";
import type { HomeLayout } from "@dopl/shared/schemas/home";
import type { Priority, StateGroup } from "@dopl/shared/schemas/work-item";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere, projectAccessById } from "./projects";
import { getView } from "./views";
import { listItems } from "./work-items";
import { workspaceProjects } from "./workspace-items";

/** `WorkspaceMember.preferences`: an object of per-feature UI settings (Home's is `home`). */
export const PreferencesSchema = z.record(z.string(), z.unknown()).catch({});

export interface HomeLayoutState {
  layout: HomeLayout;
  /** False while the member is on the default layout. */
  custom: boolean;
}

/** The member's Home widgets (D-141), or the default until they customize. */
export async function getHomeLayout(ctx: WorkspaceCtx): Promise<HomeLayoutState> {
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.actor.userId } },
    select: { preferences: true },
  });
  const stored = parseHomeLayout(PreferencesSchema.parse(member?.preferences ?? {}).home);
  return stored ? { layout: stored, custom: true } : { layout: DEFAULT_HOME_LAYOUT, custom: false };
}

export interface ViewPreview {
  view: { id: string; name: string; href: string };
  rows: Array<{
    id: string;
    identifier: string;
    title: string;
    priority: Priority;
    stateGroup: StateGroup;
    stateName: string;
    stateColor: string;
    dueDate: string | null;
  }>;
  /** More items match than the preview shows. */
  more: boolean;
}

/**
 * The first rows of a saved view for Home's view widget: the view's own
 * filter and "completed" mode, over the projects it covers, with the same
 * policy checks as opening the view.
 */
export async function getViewPreview(
  ctx: WorkspaceCtx,
  id: string,
  limit = 8,
): Promise<ViewPreview> {
  const view = await getView(ctx, id);
  let projects: Array<{ id: string; identifier: string }>;
  let href = `/${ctx.workspace.slug}/views/${view.id}`;
  if (view.projectId) {
    const { project } = await projectAccessById(ctx, view.projectId);
    projects = [project];
    href = `/${ctx.workspace.slug}/p/${project.identifier}/views/${view.id}`;
  } else {
    projects = await workspaceProjects(ctx);
  }
  const res = await listItems(
    ctx,
    projects,
    { completed: view.displayOptions.completed, filters: view.filters },
    { limit: limit + 1 },
  );
  const shown = res.rows.slice(0, limit);
  const states = await db.workflowState.findMany({
    where: { id: { in: [...new Set(shown.map((r) => r.stateId))] } },
    select: { id: true, name: true, color: true },
  });
  const byId = new Map(states.map((s) => [s.id, s]));
  return {
    view: { id: view.id, name: view.name, href },
    rows: shown.map((r) => ({
      id: r.id,
      identifier: r.identifier,
      title: r.title,
      priority: r.priority,
      stateGroup: r.stateGroup,
      stateName: byId.get(r.stateId)?.name ?? "",
      stateColor: byId.get(r.stateId)?.color ?? "",
      dueDate: r.dueDate,
    })),
    more: res.rows.length > limit || res.truncated,
  };
}

export interface InboxSummary {
  unread: number;
  latest: Array<{
    id: string;
    type: string;
    read: boolean;
    createdAt: string;
    actor: {
      id: string;
      name: string;
      image: string | null;
      kind: "HUMAN" | "AGENT" | "SYSTEM";
    } | null;
    item: { identifier: string; title: string } | null;
    title: string | null;
  }>;
}

/**
 * Home's inbox card: the unread count and the latest few notifications
 * (the full inbox lives at /[ws]/inbox). Snoozed and archived rows are left
 * out; items the member can no longer see lose their link.
 */
export async function getInboxSummary(ctx: WorkspaceCtx, take = 5): Promise<InboxSummary> {
  const now = new Date();
  const where = {
    workspaceId: ctx.workspace.id,
    recipientId: ctx.actor.userId,
    archivedAt: null,
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
  };
  const [unread, rows] = await Promise.all([
    db.notification.count({ where: { ...where, readAt: null } }),
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        type: true,
        readAt: true,
        createdAt: true,
        data: true,
        actor: { select: { id: true, name: true, image: true, kind: true } },
        workItem: {
          select: {
            sequence: true,
            title: true,
            deletedAt: true,
            project: { select: { id: true, identifier: true } },
          },
        },
      },
    }),
  ]);
  const projectIds = [
    ...new Set(rows.map((r) => r.workItem?.project.id).filter((x): x is string => Boolean(x))),
  ];
  const visible = new Set(
    projectIds.length
      ? (
          await db.project.findMany({
            where: { ...accessibleProjectsWhere(ctx), id: { in: projectIds } },
            select: { id: true },
          })
        ).map((p) => p.id)
      : [],
  );
  return {
    unread,
    latest: rows.map((r) => {
      const w = r.workItem;
      const data = (r.data ?? {}) as { title?: unknown };
      return {
        id: r.id,
        type: r.type,
        read: Boolean(r.readAt),
        createdAt: r.createdAt.toISOString(),
        actor: r.actor,
        item:
          w && !w.deletedAt && visible.has(w.project.id)
            ? { identifier: formatIdentifier(w.project.identifier, w.sequence), title: w.title }
            : null,
        title: typeof data.title === "string" ? data.title : null,
      };
    }),
  };
}
