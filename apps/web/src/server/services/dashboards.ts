import "server-only";
import type { Prisma, TransactionClient } from "@dopl/db";
import { PROJECT_DASHBOARD, WORKSPACE_DASHBOARD } from "@dopl/shared/domain/dashboards";
import {
  canDashboard,
  canWorkspace,
  ForbiddenError,
  type DashboardAction,
} from "@dopl/shared/policy";
import {
  CreateDashboardSchema,
  IdSchema,
  MoveWidgetSchema,
  ResizeWidgetSchema,
  SaveWidgetSchema,
  UpdateDashboardSchema,
  WidgetPositionSchema,
  type WidgetPosition,
  type WidgetSpec,
} from "@dopl/shared/schemas/analytics";
import { normalizeFilter } from "@dopl/shared/schemas/filters";
import { keyAfter, keyBetween, keysBetween } from "@dopl/shared/sort-keys";
import { NotFoundError } from "../action-result";
import { withMutation, type Mutation } from "../mutation";
import { projectAccessById } from "../queries/projects";
import type { WorkspaceCtx } from "../session";

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** The widget columns for a spec (filters normalized like saved views). */
function specColumns(spec: WidgetSpec) {
  return {
    metric: spec.metric,
    chartType: spec.chartType,
    xAxis: spec.xAxis,
    segment: spec.segment,
    filters: json(normalizeFilter(spec.filters)),
  };
}

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function loadDashboard(
  tx: TransactionClient,
  ctx: WorkspaceCtx,
  id: string,
  action: DashboardAction,
) {
  const d = await tx.dashboard.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null },
    select: { id: true, ownerId: true, visibility: true, projectId: true },
  });
  if (!d || !canDashboard(ctx.policyActor, d, "dashboard.view")) throw new NotFoundError();
  if (!canDashboard(ctx.policyActor, d, action)) throw new ForbiddenError();
  return d;
}

/** A widget and its (editable) dashboard. */
async function loadWidget(tx: TransactionClient, ctx: WorkspaceCtx, id: string) {
  const w = await tx.dashboardWidget.findFirst({
    where: { id, dashboard: { workspaceId: ctx.workspace.id, deletedAt: null } },
    select: { id: true, dashboardId: true, position: true },
  });
  if (!w) throw new NotFoundError();
  await loadDashboard(tx, ctx, w.dashboardId, "dashboard.edit");
  const position = WidgetPositionSchema.safeParse(w.position);
  return { ...w, position: position.success ? position.data : { key: "a0", w: 6 as const } };
}

function touched(m: Mutation, dashboardId: string, verb: string, meta?: Prisma.InputJsonValue) {
  m.activity({ entityType: "DASHBOARD", entityId: dashboardId, verb, ...(meta ? { meta } : {}) });
  m.emit({
    topic: `workspace:${m.ctx.workspace.id}`,
    type: "dashboard.updated",
    payload: { id: dashboardId },
  });
}

async function positions(tx: TransactionClient, dashboardId: string): Promise<WidgetPosition[]> {
  const rows = await tx.dashboardWidget.findMany({
    where: { dashboardId },
    select: { position: true },
  });
  return rows
    .map((r) => WidgetPositionSchema.safeParse(r.position))
    .flatMap((p) => (p.success ? [p.data] : []))
    .sort((a, b) => byKey(a.key, b.key));
}

/* ───────────────────────── dashboards ───────────────────────── */

export async function createDashboard(ctx: WorkspaceCtx, raw: unknown) {
  const input = CreateDashboardSchema.parse(raw);
  if (!canWorkspace(ctx.policyActor, "analytics.view")) throw new ForbiddenError();
  if (input.projectId) {
    const access = await projectAccessById(ctx, input.projectId);
    if (!access.can("project.view")) throw new ForbiddenError();
  }
  const template =
    input.fromDefault === "project"
      ? PROJECT_DASHBOARD
      : input.fromDefault === "workspace"
        ? WORKSPACE_DASHBOARD
        : [];
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    const last = await tx.dashboard.findMany({
      where: { workspaceId: ctx.workspace.id, projectId: input.projectId, deletedAt: null },
      select: { sortKey: true },
    });
    const lastKey =
      last
        .map((l) => l.sortKey)
        .sort(byKey)
        .at(-1) ?? null;
    const d = await tx.dashboard.create({
      data: {
        workspaceId: ctx.workspace.id,
        projectId: input.projectId,
        ownerId: ctx.actor.userId,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        sortKey: keyAfter(lastKey),
      },
      select: { id: true },
    });
    if (template.length) {
      const keys = keysBetween(null, null, template.length);
      await tx.dashboardWidget.createMany({
        data: template.map((t, i) => ({
          dashboardId: d.id,
          title: input.titles[t.key] ?? t.key,
          ...specColumns(t.spec),
          position: json({ key: keys[i]!, w: t.w }),
        })),
      });
    }
    touched(m, d.id, "created", { fromDefault: input.fromDefault });
    return { id: d.id };
  });
}

export async function updateDashboard(ctx: WorkspaceCtx, raw: unknown) {
  const input = UpdateDashboardSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    await loadDashboard(m.tx, ctx, input.id, "dashboard.edit");
    const data: Prisma.DashboardUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.visibility !== undefined) data.visibility = input.visibility;
    await m.tx.dashboard.update({ where: { id: input.id }, data });
    touched(m, input.id, "updated", { fields: Object.keys(data) });
    return { id: input.id };
  });
}

/** Soft delete (D-020): the row and its widgets stay for 30 days. */
export async function deleteDashboard(ctx: WorkspaceCtx, rawId: unknown) {
  const id = IdSchema.parse(rawId);
  return withMutation(ctx, async (m) => {
    await loadDashboard(m.tx, ctx, id, "dashboard.delete");
    await m.tx.dashboard.update({ where: { id }, data: { deletedAt: new Date() } });
    touched(m, id, "deleted");
    return { id };
  });
}

/* ───────────────────────── widgets ───────────────────────── */

/** Adds a widget at the end, or changes one (title, chart, width). */
export async function saveWidget(ctx: WorkspaceCtx, raw: unknown) {
  const input = SaveWidgetSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    await loadDashboard(tx, ctx, input.dashboardId, "dashboard.edit");
    if (input.id) {
      const w = await loadWidget(tx, ctx, input.id);
      if (w.dashboardId !== input.dashboardId) throw new NotFoundError();
      await tx.dashboardWidget.update({
        where: { id: w.id },
        data: {
          title: input.title,
          ...specColumns(input.spec),
          ...(input.w ? { position: json({ ...w.position, w: input.w }) } : {}),
        },
      });
      touched(m, input.dashboardId, "widget_updated", { widgetId: w.id });
      return { id: w.id };
    }
    const last = (await positions(tx, input.dashboardId)).at(-1)?.key ?? null;
    const created = await tx.dashboardWidget.create({
      data: {
        dashboardId: input.dashboardId,
        title: input.title,
        ...specColumns(input.spec),
        position: json({ key: keyAfter(last), w: input.w ?? 6 }),
      },
      select: { id: true },
    });
    touched(m, input.dashboardId, "widget_added", { widgetId: created.id });
    return { id: created.id };
  });
}

/** Drag to reorder: the new key sits between its new neighbours'. */
export async function moveWidget(ctx: WorkspaceCtx, raw: unknown) {
  const input = MoveWidgetSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const w = await loadWidget(m.tx, ctx, input.id);
    const key = keyBetween(input.before, input.after);
    await m.tx.dashboardWidget.update({
      where: { id: w.id },
      data: { position: json({ ...w.position, key }) },
    });
    touched(m, w.dashboardId, "widget_moved", { widgetId: w.id });
    return { id: w.id, key };
  });
}

export async function resizeWidget(ctx: WorkspaceCtx, raw: unknown) {
  const input = ResizeWidgetSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const w = await loadWidget(m.tx, ctx, input.id);
    await m.tx.dashboardWidget.update({
      where: { id: w.id },
      data: { position: json({ ...w.position, w: input.w }) },
    });
    touched(m, w.dashboardId, "widget_resized", { widgetId: w.id });
    return { id: w.id, w: input.w };
  });
}

export async function deleteWidget(ctx: WorkspaceCtx, rawId: unknown) {
  const id = IdSchema.parse(rawId);
  return withMutation(ctx, async (m) => {
    const w = await loadWidget(m.tx, ctx, id);
    await m.tx.dashboardWidget.delete({ where: { id } });
    touched(m, w.dashboardId, "widget_removed", { widgetId: id });
    return { id };
  });
}
