import "server-only";
import type { Prisma } from "@dopl/db";
import {
  aggregate,
  aggregateSnapshots,
  previousWindow,
  NONE_KEY,
  type AggregateContext,
  type ChartData,
  type IntakeRow,
  type ItemRow,
  type SnapshotRow,
} from "@dopl/shared/domain/analytics";
import { addDays, todayIn } from "@dopl/shared/domain/dates";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import {
  METRIC_DEFS,
  MetricQuerySchema,
  RANGE_DAYS,
  isTimeAxis,
  type CategoryAxis,
  type MetricQuery,
} from "@dopl/shared/schemas/analytics";
import { isGroup } from "@dopl/shared/schemas/filters";
import { OPEN_GROUPS } from "@dopl/shared/schemas/work-item";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { compileFilter, startOfDayIn } from "./filters";
import { accessibleProjectsWhere } from "./projects";
import { compileContext } from "./work-items";

/** A label for an entity key (states, people, labels, types, projects); enums are translated in the UI. */
export interface KeyLabel {
  label: string;
  color?: string | null;
}

export interface MetricResult extends ChartData {
  /** The headline for the window before this one, for the delta on number tiles. */
  previous: number | null;
  from: string;
  to: string;
  labels: Record<string, KeyLabel>;
}

/** Hard cap on rows one chart reads; the window and filters keep real charts far below it. */
const ROW_CAP = 100_000;

const itemSelect = {
  id: true,
  projectId: true,
  stateId: true,
  stateGroup: true,
  priority: true,
  typeId: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  assignees: { select: { userId: true } },
  labels: { select: { labelId: true } },
} satisfies Prisma.WorkItemSelect;
type ItemSelected = Prisma.WorkItemGetPayload<{ select: typeof itemSelect }>;

const toItemRow = (r: ItemSelected): ItemRow => ({
  id: r.id,
  projectId: r.projectId,
  stateId: r.stateId,
  stateGroup: r.stateGroup,
  priority: r.priority,
  typeId: r.typeId,
  createdAt: r.createdAt,
  startedAt: r.startedAt,
  completedAt: r.completedAt,
  assigneeIds: r.assignees.map((a) => a.userId),
  labelIds: r.labels.map((l) => l.labelId),
});

/**
 * Runs one chart for the reader (ROADMAP §Phase 6.1). Rows are limited to
 * the projects the reader can browse, then the chart's filter and the date
 * window; the shared aggregator does the counting. A shared dashboard shows
 * each reader their own numbers.
 */
export async function runMetric(ctx: WorkspaceCtx, raw: unknown): Promise<MetricResult> {
  if (!canWorkspace(ctx.policyActor, "analytics.view")) throw new ForbiddenError();
  const query = MetricQuerySchema.parse(raw);
  const { spec } = query;
  const def = METRIC_DEFS[spec.metric];
  const tz = ctx.workspace.timezone;
  const to = todayIn(tz);
  const from = addDays(to, -(RANGE_DAYS[query.range] - 1));
  const agg: AggregateContext = {
    timeZone: tz,
    weekStartsOn: ctx.workspace.weekStartsOn,
    from,
    to,
  };
  const prev = previousWindow(agg);

  const projects: Prisma.ProjectWhereInput = query.projectId
    ? { AND: [accessibleProjectsWhere(ctx), { id: query.projectId }] }
    : accessibleProjectsWhere(ctx);
  const filter = compileFilter(spec.filters, compileContext(ctx));
  const hasFilter = spec.filters.items.some((i) => !isGroup(i) || i.items.length > 0);

  let data: ChartData;
  let previous: number | null = null;

  if (def.kind === "snapshot") {
    data = aggregateSnapshots(spec, await loadSnapshots(ctx, projects, agg), agg);
  } else if (def.source === "intake") {
    const field = def.dateField === "triagedAt" ? "triagedAt" : "createdAt";
    const rows = await db.intakeItem.findMany({
      where: {
        project: projects,
        workItem: { deletedAt: null, ...(hasFilter ? filter : {}) },
        [field]: { gte: startOfDayIn(prev.from, tz), lt: startOfDayIn(addDays(to, 1), tz) },
      },
      select: {
        id: true,
        projectId: true,
        status: true,
        source: true,
        createdAt: true,
        triagedAt: true,
      },
      take: ROW_CAP,
    });
    const intake: IntakeRow[] = rows;
    data = aggregate(spec, { intake }, agg);
    previous = aggregate({ ...spec, xAxis: "none", segment: null }, { intake }, prev).total;
  } else {
    const items = await loadItems(ctx, spec.metric, projects, filter, agg, prev);
    data = aggregate(spec, { items }, agg);
    if (def.dateField)
      previous = aggregate({ ...spec, xAxis: "none", segment: null }, { items }, prev).total;
  }

  return { ...data, previous, from, to, labels: await labelsFor(ctx, data, spec) };
}

async function loadItems(
  ctx: WorkspaceCtx,
  metric: MetricQuery["spec"]["metric"],
  projects: Prisma.ProjectWhereInput,
  filter: Prisma.WorkItemWhereInput,
  agg: AggregateContext,
  prev: AggregateContext,
): Promise<ItemRow[]> {
  const tz = agg.timeZone;
  const span = {
    gte: startOfDayIn(prev.from, tz),
    lt: startOfDayIn(addDays(agg.to, 1), tz),
  };
  let scope: Prisma.WorkItemWhereInput;
  switch (metric) {
    case "open_items":
      scope = { stateGroup: { in: OPEN_GROUPS }, archivedAt: null };
      break;
    case "overdue":
      scope = {
        stateGroup: { in: OPEN_GROUPS },
        archivedAt: null,
        dueDate: { lt: new Date(`${agg.to}T00:00:00Z`) },
      };
      break;
    case "created":
      scope = { createdAt: span };
      break;
    case "flow":
      scope = { OR: [{ createdAt: span }, { completedAt: span }] };
      break;
    default:
      // completed, throughput, cycle and lead time: completed in the window
      scope = { stateGroup: "COMPLETED", completedAt: span };
  }
  const rows = await db.workItem.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      deletedAt: null,
      stateGroup: { not: "TRIAGE" },
      project: projects,
      AND: [scope, filter],
    },
    select: itemSelect,
    take: ROW_CAP,
  });
  return rows.map(toItemRow);
}

/**
 * Nightly snapshots in the window, plus today's live numbers so the chart has
 * a current point before the first night (and between runs).
 */
async function loadSnapshots(
  ctx: WorkspaceCtx,
  projects: Prisma.ProjectWhereInput,
  agg: AggregateContext,
): Promise<SnapshotRow[]> {
  const stored = await db.projectDailyStat.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      project: projects,
      date: { gte: new Date(`${agg.from}T00:00:00Z`), lt: new Date(`${agg.to}T00:00:00Z`) },
    },
    select: {
      projectId: true,
      date: true,
      byStateGroup: true,
      byPriority: true,
      openCount: true,
    },
  });
  const live = await db.workItem.groupBy({
    by: ["projectId", "stateGroup", "priority"],
    where: {
      workspaceId: ctx.workspace.id,
      deletedAt: null,
      archivedAt: null,
      stateGroup: { in: OPEN_GROUPS },
      project: projects,
    },
    _count: { _all: true },
  });
  const today = new Map<string, SnapshotRow>();
  for (const g of live) {
    const row = today.get(g.projectId) ?? {
      projectId: g.projectId,
      date: agg.to,
      byStateGroup: {},
      byPriority: {},
      openCount: 0,
    };
    const n = g._count._all;
    row.byStateGroup[g.stateGroup] = (row.byStateGroup[g.stateGroup] ?? 0) + n;
    row.byPriority[g.priority] = (row.byPriority[g.priority] ?? 0) + n;
    row.openCount += n;
    today.set(g.projectId, row);
  }
  return [
    ...stored.map((s) => ({
      projectId: s.projectId,
      date: s.date.toISOString().slice(0, 10),
      byStateGroup: (s.byStateGroup ?? {}) as Record<string, number>,
      byPriority: (s.byPriority ?? {}) as Record<string, number>,
      openCount: s.openCount,
    })),
    ...today.values(),
  ];
}

/** Names and colours for the entity keys on the axis and in the series. */
async function labelsFor(
  ctx: WorkspaceCtx,
  data: ChartData,
  spec: MetricQuery["spec"],
): Promise<Record<string, KeyLabel>> {
  const dims: Array<[CategoryAxis, string[]]> = [];
  if (spec.xAxis !== "none" && !isTimeAxis(spec.xAxis)) dims.push([spec.xAxis, data.x]);
  if (spec.segment) dims.push([spec.segment, data.series]);
  const out: Record<string, KeyLabel> = {};
  for (const [axis, raw] of dims) {
    const keys = raw.filter((k) => k !== NONE_KEY && k !== "other");
    if (keys.length === 0) continue;
    const ws = ctx.workspace.id;
    switch (axis) {
      case "state":
        for (const s of await db.workflowState.findMany({
          where: { id: { in: keys }, project: { workspaceId: ws } },
          select: { id: true, name: true, color: true },
        }))
          out[s.id] = { label: s.name, color: s.color };
        break;
      case "assignee":
        for (const u of await db.user.findMany({
          where: { id: { in: keys }, memberships: { some: { workspaceId: ws } } },
          select: { id: true, name: true },
        }))
          out[u.id] = { label: u.name };
        break;
      case "label":
        for (const l of await db.label.findMany({
          where: { id: { in: keys }, workspaceId: ws },
          select: { id: true, name: true, color: true },
        }))
          out[l.id] = { label: l.name, color: l.color };
        break;
      case "type":
        for (const t of await db.workItemType.findMany({
          where: { id: { in: keys }, workspaceId: ws },
          select: { id: true, name: true, color: true },
        }))
          out[t.id] = { label: t.name, color: t.color };
        break;
      case "project":
        for (const p of await db.project.findMany({
          where: { id: { in: keys }, workspaceId: ws },
          select: { id: true, name: true, color: true },
        }))
          out[p.id] = { label: p.name, color: p.color };
        break;
      default:
        // stateGroup, priority, intake status/source: translated in the UI.
        break;
    }
  }
  return out;
}
