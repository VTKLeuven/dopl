import "server-only";
import { canDashboard, canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import {
  WidgetPositionSchema,
  WidgetSpecSchema,
  type WidgetSpec,
  type WidgetWidth,
} from "@dopl/shared/schemas/analytics";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere } from "./projects";

export interface DashboardSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "WORKSPACE";
  projectId: string | null;
  owner: { id: string; name: string };
  canEdit: boolean;
  canDelete: boolean;
}

export interface WidgetView {
  id: string;
  title: string;
  spec: WidgetSpec;
  w: WidgetWidth;
  key: string;
}

export interface DashboardDetail extends DashboardSummary {
  widgets: WidgetView[];
}

const summarySelect = {
  id: true,
  name: true,
  description: true,
  visibility: true,
  projectId: true,
  owner: { select: { id: true, name: true } },
} as const;

function toSummary(
  ctx: WorkspaceCtx,
  d: {
    id: string;
    name: string;
    description: string | null;
    visibility: "PRIVATE" | "WORKSPACE";
    projectId: string | null;
    owner: { id: string; name: string };
  },
): DashboardSummary {
  const policy = { ownerId: d.owner.id, visibility: d.visibility };
  return {
    ...d,
    canEdit: canDashboard(ctx.policyActor, policy, "dashboard.edit"),
    canDelete: canDashboard(ctx.policyActor, policy, "dashboard.delete"),
  };
}

/** Where dashboards the reader may open live: their own, and shared ones, in projects they can browse. */
function visibleWhere(ctx: WorkspaceCtx) {
  return {
    workspaceId: ctx.workspace.id,
    deletedAt: null,
    OR: [{ ownerId: ctx.actor.userId }, { visibility: "WORKSPACE" as const }],
    AND: [{ OR: [{ projectId: null }, { project: accessibleProjectsWhere(ctx) }] }],
  };
}

/** Dashboards for the analytics sidebar: workspace-wide ones, or one project's. */
export async function listDashboards(
  ctx: WorkspaceCtx,
  projectId: string | null = null,
): Promise<DashboardSummary[]> {
  if (!canWorkspace(ctx.policyActor, "analytics.view")) throw new ForbiddenError();
  const rows = await db.dashboard.findMany({
    where: { ...visibleWhere(ctx), projectId },
    select: { ...summarySelect, sortKey: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  // Fractional keys compare as plain strings (COLLATE "C"), never localeCompare.
  rows.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  return rows.map((r) => toSummary(ctx, r));
}

export async function getDashboard(ctx: WorkspaceCtx, id: string): Promise<DashboardDetail> {
  if (!canWorkspace(ctx.policyActor, "analytics.view")) throw new ForbiddenError();
  const d = await db.dashboard.findFirst({
    where: { ...visibleWhere(ctx), id },
    select: {
      ...summarySelect,
      widgets: {
        select: {
          id: true,
          title: true,
          chartType: true,
          metric: true,
          xAxis: true,
          segment: true,
          filters: true,
          position: true,
        },
      },
    },
  });
  if (!d) throw new NotFoundError();
  const widgets: WidgetView[] = [];
  for (const w of d.widgets) {
    const spec = WidgetSpecSchema.safeParse({
      metric: w.metric,
      xAxis: w.xAxis ?? "none",
      segment: w.segment,
      chartType: w.chartType,
      filters: w.filters,
    });
    const pos = WidgetPositionSchema.safeParse(w.position);
    // A widget the registry no longer accepts is skipped rather than breaking the page.
    if (!spec.success || !pos.success) continue;
    widgets.push({ id: w.id, title: w.title, spec: spec.data, w: pos.data.w, key: pos.data.key });
  }
  widgets.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const { widgets: _, ...summary } = d;
  return { ...toSummary(ctx, summary), widgets };
}
