import { z } from "zod";
import { EMPTY_FILTER, FilterGroupSchema } from "./filters";

/**
 * Analytics (ROADMAP §Phase 6): a chart is metric × x-axis × segment, plus a
 * filter (the views' AST) and a chart type. The registry below says which
 * combinations make sense; the server and the builder both read it.
 */

export const METRICS = [
  "open_items",
  "overdue",
  "created",
  "completed",
  "flow",
  "throughput",
  "cycle_time",
  "lead_time",
  "intake_volume",
  "time_to_triage",
  "open_over_time",
] as const;
export type Metric = (typeof METRICS)[number];
export const MetricSchema = z.enum(METRICS);

/** Time buckets for over-time charts. */
export const TIME_AXES = ["day", "week", "month"] as const;
export type TimeAxis = (typeof TIME_AXES)[number];

/** Categorical dimensions (x-axis or segment). */
export const CATEGORY_AXES = [
  "stateGroup",
  "state",
  "priority",
  "assignee",
  "label",
  "type",
  "project",
  "intakeStatus",
  "intakeSource",
] as const;
export type CategoryAxis = (typeof CATEGORY_AXES)[number];

export const X_AXES = ["none", ...TIME_AXES, ...CATEGORY_AXES] as const;
export type XAxis = (typeof X_AXES)[number];
export const XAxisSchema = z.enum(X_AXES);
export const SegmentSchema = z.enum(CATEGORY_AXES).nullable();

export const CHART_TYPES = [
  "BAR",
  "STACKED_BAR",
  "LINE",
  "AREA",
  "DONUT",
  "NUMBER",
  "TABLE",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export const ChartTypeSchema = z.enum(CHART_TYPES);

export const isTimeAxis = (x: XAxis | null | undefined): x is TimeAxis =>
  x === "day" || x === "week" || x === "month";

/** What a metric measures and which axes it supports. */
export interface MetricDef {
  /** count: items; duration: days, reported as p50 and p85; snapshot: nightly stats. */
  kind: "count" | "duration" | "snapshot";
  /** Reads work items (filters apply) or intake requests (filters apply to their item). */
  source: "items" | "intake";
  /** The date the range and time buckets use; null = the current state ("now"). */
  dateField: "createdAt" | "completedAt" | "triagedAt" | "snapshot" | null;
  xAxes: readonly XAxis[];
  segments: readonly CategoryAxis[];
  defaultX: XAxis;
  defaultChart: ChartType;
  /** Charts that suit it (the builder offers only these). */
  charts: readonly ChartType[];
}

const ITEM_CATEGORIES = [
  "stateGroup",
  "state",
  "priority",
  "assignee",
  "label",
  "type",
  "project",
] as const;
const COUNT_CHARTS = ["BAR", "STACKED_BAR", "LINE", "AREA", "DONUT", "NUMBER", "TABLE"] as const;
const TIME_CHARTS = ["BAR", "STACKED_BAR", "LINE", "AREA", "NUMBER", "TABLE"] as const;
const DURATION_CHARTS = ["BAR", "LINE", "NUMBER", "TABLE"] as const;

export const METRIC_DEFS: Record<Metric, MetricDef> = {
  open_items: {
    kind: "count",
    source: "items",
    dateField: null,
    xAxes: ["none", ...ITEM_CATEGORIES],
    segments: ITEM_CATEGORIES,
    defaultX: "stateGroup",
    defaultChart: "BAR",
    charts: ["BAR", "STACKED_BAR", "DONUT", "NUMBER", "TABLE"],
  },
  overdue: {
    kind: "count",
    source: "items",
    dateField: null,
    xAxes: ["none", ...ITEM_CATEGORIES],
    segments: ITEM_CATEGORIES,
    defaultX: "none",
    defaultChart: "NUMBER",
    charts: ["BAR", "STACKED_BAR", "DONUT", "NUMBER", "TABLE"],
  },
  created: {
    kind: "count",
    source: "items",
    dateField: "createdAt",
    xAxes: ["none", ...TIME_AXES, ...ITEM_CATEGORIES],
    segments: ITEM_CATEGORIES,
    defaultX: "week",
    defaultChart: "BAR",
    charts: COUNT_CHARTS,
  },
  completed: {
    kind: "count",
    source: "items",
    dateField: "completedAt",
    xAxes: ["none", ...TIME_AXES, ...ITEM_CATEGORIES],
    segments: ITEM_CATEGORIES,
    defaultX: "week",
    defaultChart: "BAR",
    charts: COUNT_CHARTS,
  },
  flow: {
    kind: "count",
    source: "items",
    dateField: "createdAt",
    xAxes: TIME_AXES,
    segments: [],
    defaultX: "week",
    defaultChart: "LINE",
    charts: ["BAR", "LINE", "TABLE"],
  },
  throughput: {
    kind: "count",
    source: "items",
    dateField: "completedAt",
    xAxes: ["week", "month"],
    segments: ITEM_CATEGORIES,
    defaultX: "week",
    defaultChart: "BAR",
    charts: TIME_CHARTS,
  },
  cycle_time: {
    kind: "duration",
    source: "items",
    dateField: "completedAt",
    xAxes: ["none", ...TIME_AXES, ...ITEM_CATEGORIES],
    segments: [],
    defaultX: "week",
    defaultChart: "LINE",
    charts: DURATION_CHARTS,
  },
  lead_time: {
    kind: "duration",
    source: "items",
    dateField: "completedAt",
    xAxes: ["none", ...TIME_AXES, ...ITEM_CATEGORIES],
    segments: [],
    defaultX: "week",
    defaultChart: "LINE",
    charts: DURATION_CHARTS,
  },
  intake_volume: {
    kind: "count",
    source: "intake",
    dateField: "createdAt",
    xAxes: ["none", ...TIME_AXES, "project", "intakeStatus", "intakeSource"],
    segments: ["project", "intakeStatus", "intakeSource"],
    defaultX: "week",
    defaultChart: "STACKED_BAR",
    charts: COUNT_CHARTS,
  },
  time_to_triage: {
    kind: "duration",
    source: "intake",
    dateField: "triagedAt",
    xAxes: ["none", ...TIME_AXES, "project", "intakeStatus", "intakeSource"],
    segments: [],
    defaultX: "none",
    defaultChart: "NUMBER",
    charts: DURATION_CHARTS,
  },
  open_over_time: {
    kind: "snapshot",
    source: "items",
    dateField: "snapshot",
    xAxes: ["day", "week"],
    segments: ["stateGroup", "priority"],
    defaultX: "week",
    defaultChart: "AREA",
    charts: ["STACKED_BAR", "AREA", "LINE", "TABLE"],
  },
};

/** The date window every chart on a dashboard shares (filters sit above the charts). */
export const RANGES = ["30d", "90d", "180d", "365d"] as const;
export type Range = (typeof RANGES)[number];
export const RangeSchema = z.enum(RANGES);
export const RANGE_DAYS: Record<Range, number> = { "30d": 30, "90d": 90, "180d": 180, "365d": 365 };

export const WidgetSpecSchema = z
  .object({
    metric: MetricSchema,
    xAxis: XAxisSchema,
    segment: SegmentSchema.default(null),
    chartType: ChartTypeSchema,
    filters: FilterGroupSchema.default(EMPTY_FILTER),
  })
  .superRefine((s, ctx) => {
    const def = METRIC_DEFS[s.metric];
    if (!def.xAxes.includes(s.xAxis))
      ctx.addIssue({ code: "custom", path: ["xAxis"], message: "unsupported_axis" });
    if (s.segment && !def.segments.includes(s.segment))
      ctx.addIssue({ code: "custom", path: ["segment"], message: "unsupported_segment" });
    if (s.segment && s.segment === s.xAxis)
      ctx.addIssue({ code: "custom", path: ["segment"], message: "segment_is_axis" });
    if (!def.charts.includes(s.chartType))
      ctx.addIssue({ code: "custom", path: ["chartType"], message: "unsupported_chart" });
  });
export type WidgetSpec = z.infer<typeof WidgetSpecSchema>;

/** One read: a spec plus the dashboard's range and scope. */
export const MetricQuerySchema = z.object({
  spec: WidgetSpecSchema,
  range: RangeSchema.default("90d"),
  /** Limits to one project (project dashboards, or the workspace dashboard's project filter). */
  projectId: z.uuid().nullable().default(null),
});
export type MetricQuery = z.infer<typeof MetricQuerySchema>;

/** Widths on the 12-column dashboard grid. */
export const WIDGET_WIDTHS = [4, 6, 8, 12] as const;
export const WidgetWidthSchema = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(12)]);
export type WidgetWidth = z.infer<typeof WidgetWidthSchema>;

export const WidgetPositionSchema = z.object({
  /** Fractional sort key (reading order on the grid). */
  key: z.string().min(1).max(64),
  w: WidgetWidthSchema,
});
export type WidgetPosition = z.infer<typeof WidgetPositionSchema>;

const Title = z.string().trim().min(1).max(120);

export const CreateDashboardSchema = z.object({
  name: Title,
  description: z.string().trim().max(500).nullable().default(null),
  projectId: z.uuid().nullable().default(null),
  visibility: z.enum(["PRIVATE", "WORKSPACE"]).default("PRIVATE"),
  /** Copy the widgets of a built-in dashboard ("workspace" or "project"). */
  fromDefault: z.enum(["workspace", "project"]).nullable().default(null),
  /** Titles for the copied widgets by key, in the reader's language. */
  titles: z.record(z.string().max(64), Title).default({}),
});

export const UpdateDashboardSchema = z.object({
  id: z.uuid(),
  name: Title.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  visibility: z.enum(["PRIVATE", "WORKSPACE"]).optional(),
});

export const SaveWidgetSchema = z.object({
  dashboardId: z.uuid(),
  /** Absent: a new widget at the end. */
  id: z.uuid().optional(),
  title: Title,
  spec: WidgetSpecSchema,
  w: WidgetWidthSchema.optional(),
});

export const MoveWidgetSchema = z.object({
  id: z.uuid(),
  /** Neighbours after the move (null at either end). */
  before: z.string().nullable(),
  after: z.string().nullable(),
});

export const ResizeWidgetSchema = z.object({ id: z.uuid(), w: WidgetWidthSchema });
export const IdSchema = z.uuid();
