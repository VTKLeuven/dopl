import {
  METRIC_DEFS,
  isTimeAxis,
  type CategoryAxis,
  type Metric,
  type TimeAxis,
  type WidgetSpec,
  type XAxis,
} from "../schemas/analytics";
import { priorities, type StateGroup } from "../schemas/work-item";
import { addDays, diffDays, startOfWeek, todayIn } from "./dates";

/**
 * Pure metric aggregation (ROADMAP §Phase 6). The server loads the rows the
 * reader may see (policy scope, the chart's filter, the date window) and this
 * module counts, buckets and takes percentiles, so every metric is testable
 * against hand-computed fixtures.
 */

export interface ItemRow {
  id: string;
  projectId: string;
  stateId: string;
  stateGroup: StateGroup;
  priority: string;
  typeId: string | null;
  assigneeIds: string[];
  labelIds: string[];
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface IntakeRow {
  id: string;
  projectId: string;
  status: string;
  source: string;
  createdAt: Date;
  triagedAt: Date | null;
}

export interface SnapshotRow {
  projectId: string;
  /** YYYY-MM-DD */
  date: string;
  byStateGroup: Record<string, number>;
  byPriority: Record<string, number>;
  openCount: number;
}

export interface AggregateContext {
  timeZone: string;
  weekStartsOn: number;
  /** Inclusive calendar window in the workspace time zone. */
  from: string;
  to: string;
}

export interface ChartData {
  metric: Metric;
  unit: "items" | "days";
  xAxis: XAxis;
  /** x keys in display order: time buckets (YYYY-MM-DD) or category keys. */
  x: string[];
  /** Series keys in display order ("value", segment keys, created/completed, p50/p85). */
  series: string[];
  /** values[x][series]; null = no data (a duration with no items). */
  values: Record<string, Record<string, number | null>>;
  /** The headline: distinct items counted, or the overall p50 in days. */
  total: number | null;
}

export const NONE_KEY = "none";
export const OTHER_KEY = "other";
/** Categorical series never exceed eight colours; the rest fold into "Other". */
export const MAX_SERIES = 8;
/** Bars on a categorical x-axis. */
export const MAX_CATEGORIES = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ───────────────────────── dates ───────────────────────── */

/** The bucket (its first day) an instant falls in, in the workspace time zone. */
export function bucketOf(date: Date, axis: TimeAxis, ctx: AggregateContext): string {
  return bucketOfDay(todayIn(ctx.timeZone, date), axis, ctx.weekStartsOn);
}

export function bucketOfDay(day: string, axis: TimeAxis, weekStartsOn: number): string {
  if (axis === "day") return day;
  if (axis === "week") return startOfWeek(day, weekStartsOn);
  return `${day.slice(0, 7)}-01`;
}

/** Every bucket overlapping [from, to], so empty periods show as zero. */
export function bucketsBetween(
  from: string,
  to: string,
  axis: TimeAxis,
  weekStartsOn: number,
): string[] {
  const out: string[] = [];
  let b = bucketOfDay(from, axis, weekStartsOn);
  while (b <= to) {
    out.push(b);
    if (axis === "day") b = addDays(b, 1);
    else if (axis === "week") b = addDays(b, 7);
    else {
      const [y, m] = b.split("-").map(Number) as [number, number];
      b = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
  }
  return out;
}

/** Is the instant's calendar day inside the window? */
export function inWindow(date: Date | null, ctx: AggregateContext): boolean {
  if (!date) return false;
  const day = todayIn(ctx.timeZone, date);
  return day >= ctx.from && day <= ctx.to;
}

/** The window that ends the day before `from`, with the same length (for deltas). */
export function previousWindow(ctx: AggregateContext): AggregateContext {
  const days = diffDays(ctx.to, ctx.from) + 1;
  return { ...ctx, from: addDays(ctx.from, -days), to: addDays(ctx.from, -1) };
}

/* ───────────────────────── statistics ───────────────────────── */

/** Continuous percentile with linear interpolation (like PERCENTILE_CONT). */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (rank - lo);
}

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const days = (a: Date, b: Date) => (b.getTime() - a.getTime()) / DAY_MS;

/* ───────────────────────── categories ───────────────────────── */

const STATE_GROUP_ORDER: StateGroup[] = [
  "TRIAGE",
  "BACKLOG",
  "UNSTARTED",
  "STARTED",
  "COMPLETED",
  "CANCELLED",
];
const INTAKE_STATUS_ORDER = ["PENDING", "ACCEPTED", "DECLINED", "DUPLICATE"];
const INTAKE_SOURCE_ORDER = ["IN_APP", "FORM", "EMAIL", "API"];

/** Categories with a natural order keep it; the rest sort by size. */
export const FIXED_ORDER: Partial<Record<CategoryAxis, readonly string[]>> = {
  stateGroup: STATE_GROUP_ORDER,
  priority: priorities,
  intakeStatus: INTAKE_STATUS_ORDER,
  intakeSource: INTAKE_SOURCE_ORDER,
};

function itemKeys(row: ItemRow, axis: CategoryAxis): string[] {
  switch (axis) {
    case "stateGroup":
      return [row.stateGroup];
    case "state":
      return [row.stateId];
    case "priority":
      return [row.priority];
    case "type":
      return [row.typeId ?? NONE_KEY];
    case "project":
      return [row.projectId];
    case "assignee":
      return row.assigneeIds.length ? row.assigneeIds : [NONE_KEY];
    case "label":
      return row.labelIds.length ? row.labelIds : [NONE_KEY];
    default:
      return [NONE_KEY];
  }
}

function intakeKeys(row: IntakeRow, axis: CategoryAxis): string[] {
  switch (axis) {
    case "project":
      return [row.projectId];
    case "intakeStatus":
      return [row.status];
    case "intakeSource":
      return [row.source];
    default:
      return [NONE_KEY];
  }
}

/**
 * Orders keys (fixed order, else by size, "none" last) and folds everything
 * past `limit` into "other".
 */
export function orderKeys(
  sizes: Map<string, number>,
  axis: CategoryAxis,
  limit: number,
): { keys: string[]; fold: (k: string) => string } {
  const fixed = FIXED_ORDER[axis];
  let keys = [...sizes.keys()];
  if (fixed) keys.sort((a, b) => fixed.indexOf(a) - fixed.indexOf(b));
  else
    keys.sort((a, b) =>
      a === NONE_KEY
        ? 1
        : b === NONE_KEY
          ? -1
          : (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0) || (a < b ? -1 : 1),
    );
  if (keys.length <= limit) return { keys, fold: (k) => k };
  const kept = new Set(keys.slice(0, limit - 1));
  return { keys: [...kept, OTHER_KEY], fold: (k) => (kept.has(k) ? k : OTHER_KEY) };
}

/* ───────────────────────── aggregation ───────────────────────── */

interface Point {
  /** The date the metric is about (bucketing, window). */
  at: Date | null;
  x: (axis: CategoryAxis) => string[];
  /** Days, for durations. */
  value?: number;
  series?: string;
  id: string;
}

function itemPoints(metric: Metric, rows: readonly ItemRow[], ctx: AggregateContext): Point[] {
  const x = (r: ItemRow) => (axis: CategoryAxis) => itemKeys(r, axis);
  switch (metric) {
    case "open_items":
    case "overdue":
      return rows.map((r) => ({ at: null, x: x(r), id: r.id }));
    case "created":
      return rows
        .filter((r) => inWindow(r.createdAt, ctx))
        .map((r) => ({ at: r.createdAt, x: x(r), id: r.id }));
    case "completed":
    case "throughput":
      return rows
        .filter((r) => r.stateGroup === "COMPLETED" && inWindow(r.completedAt, ctx))
        .map((r) => ({ at: r.completedAt, x: x(r), id: r.id }));
    case "flow":
      return [
        ...rows
          .filter((r) => inWindow(r.createdAt, ctx))
          .map((r) => ({ at: r.createdAt, x: x(r), id: r.id, series: "created" })),
        ...rows
          .filter((r) => r.stateGroup === "COMPLETED" && inWindow(r.completedAt, ctx))
          .map((r) => ({ at: r.completedAt, x: x(r), id: `${r.id}:c`, series: "completed" })),
      ];
    case "cycle_time":
      return rows
        .filter((r) => r.stateGroup === "COMPLETED" && r.startedAt && inWindow(r.completedAt, ctx))
        .map((r) => ({
          at: r.completedAt,
          x: x(r),
          id: r.id,
          value: Math.max(0, days(r.startedAt!, r.completedAt!)),
        }));
    case "lead_time":
      return rows
        .filter((r) => r.stateGroup === "COMPLETED" && inWindow(r.completedAt, ctx))
        .map((r) => ({
          at: r.completedAt,
          x: x(r),
          id: r.id,
          value: Math.max(0, days(r.createdAt, r.completedAt!)),
        }));
    default:
      return [];
  }
}

function intakePoints(metric: Metric, rows: readonly IntakeRow[], ctx: AggregateContext): Point[] {
  const x = (r: IntakeRow) => (axis: CategoryAxis) => intakeKeys(r, axis);
  if (metric === "intake_volume")
    return rows
      .filter((r) => inWindow(r.createdAt, ctx))
      .map((r) => ({ at: r.createdAt, x: x(r), id: r.id }));
  if (metric === "time_to_triage")
    return rows
      .filter((r) => r.triagedAt && inWindow(r.triagedAt, ctx))
      .map((r) => ({
        at: r.triagedAt,
        x: x(r),
        id: r.id,
        value: Math.max(0, days(r.createdAt, r.triagedAt!)),
      }));
  return [];
}

/** Builds the chart for a count or duration metric. */
export function aggregate(
  spec: Pick<WidgetSpec, "metric" | "xAxis" | "segment">,
  input: { items?: readonly ItemRow[]; intake?: readonly IntakeRow[] },
  ctx: AggregateContext,
): ChartData {
  const def = METRIC_DEFS[spec.metric];
  const points =
    def.source === "items"
      ? itemPoints(spec.metric, input.items ?? [], ctx)
      : intakePoints(spec.metric, input.intake ?? [], ctx);
  const duration = def.kind === "duration";
  const xAxis = spec.xAxis;
  const segment = duration ? null : spec.segment;

  // x keys for each point
  const xOf = (p: Point): string[] =>
    xAxis === "none" ? ["all"] : isTimeAxis(xAxis) ? [bucketOf(p.at!, xAxis, ctx)] : p.x(xAxis);

  let xKeys: string[];
  let foldX = (k: string) => k;
  if (xAxis === "none") xKeys = ["all"];
  else if (isTimeAxis(xAxis)) xKeys = bucketsBetween(ctx.from, ctx.to, xAxis, ctx.weekStartsOn);
  else {
    const sizes = new Map<string, number>();
    for (const p of points) for (const k of xOf(p)) sizes.set(k, (sizes.get(k) ?? 0) + 1);
    const o = orderKeys(sizes, xAxis, MAX_CATEGORIES);
    xKeys = o.keys;
    foldX = o.fold;
  }

  // series keys
  let seriesKeys: string[];
  let seriesOf: (p: Point) => string[];
  if (duration) {
    seriesKeys = ["p50", "p85"];
    seriesOf = () => ["value"];
  } else if (spec.metric === "flow") {
    seriesKeys = ["created", "completed"];
    seriesOf = (p) => [p.series!];
  } else if (segment) {
    const sizes = new Map<string, number>();
    for (const p of points) for (const k of p.x(segment)) sizes.set(k, (sizes.get(k) ?? 0) + 1);
    const o = orderKeys(sizes, segment, MAX_SERIES);
    seriesKeys = o.keys;
    seriesOf = (p) => [...new Set(p.x(segment).map(o.fold))];
  } else {
    seriesKeys = ["value"];
    seriesOf = () => ["value"];
  }

  const values: ChartData["values"] = {};
  for (const x of xKeys)
    values[x] = Object.fromEntries(seriesKeys.map((s) => [s, duration ? null : 0]));

  if (duration) {
    const samples = new Map<string, number[]>();
    for (const p of points)
      for (const x of new Set(xOf(p).map(foldX))) {
        const list = samples.get(x) ?? [];
        list.push(p.value!);
        samples.set(x, list);
      }
    for (const [x, list] of samples) {
      if (!values[x]) continue;
      values[x] = { p50: round1(percentile(list, 0.5)), p85: round1(percentile(list, 0.85)) };
    }
  } else {
    for (const p of points)
      for (const x of new Set(xOf(p).map(foldX))) {
        const row = values[x];
        if (!row) continue;
        for (const s of seriesOf(p)) row[s] = (row[s] ?? 0) + 1;
      }
  }

  return {
    metric: spec.metric,
    unit: duration ? "days" : "items",
    xAxis,
    x: xKeys,
    series: seriesKeys,
    values,
    total: duration
      ? round1(
          percentile(
            points.map((p) => p.value!),
            0.5,
          ),
        )
      : spec.metric === "flow"
        ? points.filter((p) => p.series === "completed").length
        : new Set(points.map((p) => p.id)).size,
  };
}

/**
 * Open items over time from nightly snapshots: per bucket, the last snapshot
 * in it (summed over projects), split by state group or priority.
 */
export function aggregateSnapshots(
  spec: Pick<WidgetSpec, "xAxis" | "segment">,
  rows: readonly SnapshotRow[],
  ctx: AggregateContext,
): ChartData {
  const axis: TimeAxis = spec.xAxis === "day" ? "day" : "week";
  const xKeys = bucketsBetween(ctx.from, ctx.to, axis, ctx.weekStartsOn);
  const seriesKeys =
    spec.segment === "stateGroup"
      ? ["BACKLOG", "UNSTARTED", "STARTED"]
      : spec.segment === "priority"
        ? [...priorities]
        : ["value"];
  // Latest date per (bucket, project).
  const latest = new Map<string, SnapshotRow>();
  for (const r of rows) {
    if (r.date < ctx.from || r.date > ctx.to) continue;
    const key = `${bucketOfDay(r.date, axis, ctx.weekStartsOn)}|${r.projectId}`;
    const prev = latest.get(key);
    if (!prev || prev.date < r.date) latest.set(key, r);
  }
  const values: ChartData["values"] = {};
  const seen = new Set<string>();
  for (const x of xKeys) values[x] = Object.fromEntries(seriesKeys.map((s) => [s, null]));
  for (const [key, r] of latest) {
    const x = key.slice(0, key.indexOf("|"));
    const row = values[x];
    if (!row) continue;
    seen.add(x);
    for (const s of seriesKeys) {
      const n =
        s === "value"
          ? r.openCount
          : spec.segment === "stateGroup"
            ? (r.byStateGroup[s] ?? 0)
            : (r.byPriority[s] ?? 0);
      row[s] = (row[s] ?? 0) + n;
    }
  }
  const last = [...xKeys].reverse().find((x) => seen.has(x));
  const lastRow = last ? values[last] : undefined;
  return {
    metric: "open_over_time",
    unit: "items",
    xAxis: axis,
    x: xKeys,
    series: seriesKeys,
    values,
    total: lastRow ? Object.values(lastRow).reduce<number>((a, b) => a + (b ?? 0), 0) : null,
  };
}

/** True when the chart has nothing to show (for the empty state). */
export function isEmptyChart(data: ChartData): boolean {
  return !Object.values(data.values).some((row) =>
    Object.values(row).some((v) => v !== null && v !== 0),
  );
}
