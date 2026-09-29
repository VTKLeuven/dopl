import { EMPTY_FILTER } from "../schemas/filters";
import type { WidgetSpec, WidgetWidth } from "../schemas/analytics";

/**
 * The built-in dashboards (ROADMAP §Phase 6.3). They live in code, not in the
 * database: every workspace and project gets them without a migration or a
 * seed, and "Duplicate" copies one into an editable dashboard.
 */
export type DefaultWidgetKey =
  | "open"
  | "completed"
  | "overdue"
  | "flow"
  | "openByState"
  | "openOverTime"
  | "openByProject"
  | "openByPriority"
  | "openByAssignee"
  | "throughput"
  | "cycleTime"
  | "intakeVolume"
  | "timeToTriage"
  | "leadTime";

export interface DefaultWidget {
  /** Stable key; also the i18n key under `analytics.default`. */
  key: DefaultWidgetKey;
  spec: WidgetSpec;
  w: WidgetWidth;
}

const w = (
  key: DefaultWidgetKey,
  width: WidgetWidth,
  spec: Omit<WidgetSpec, "filters" | "segment"> & Partial<Pick<WidgetSpec, "segment">>,
): DefaultWidget => ({
  key,
  w: width,
  spec: { segment: null, filters: EMPTY_FILTER, ...spec },
});

const HEADLINES = [
  w("open", 4, { metric: "open_items", xAxis: "none", chartType: "NUMBER" }),
  w("completed", 4, { metric: "completed", xAxis: "none", chartType: "NUMBER" }),
  w("overdue", 4, { metric: "overdue", xAxis: "none", chartType: "NUMBER" }),
];

const FLOW = [
  w("flow", 8, { metric: "flow", xAxis: "week", chartType: "LINE" }),
  w("openByState", 4, { metric: "open_items", xAxis: "stateGroup", chartType: "DONUT" }),
  w("openOverTime", 12, {
    metric: "open_over_time",
    xAxis: "week",
    segment: "stateGroup",
    chartType: "AREA",
  }),
];

const SPEED = [
  w("throughput", 6, { metric: "throughput", xAxis: "week", chartType: "BAR" }),
  w("cycleTime", 6, { metric: "cycle_time", xAxis: "week", chartType: "LINE" }),
];

const INTAKE = [
  w("intakeVolume", 4, {
    metric: "intake_volume",
    xAxis: "week",
    segment: "intakeStatus",
    chartType: "STACKED_BAR",
  }),
  w("timeToTriage", 4, { metric: "time_to_triage", xAxis: "none", chartType: "NUMBER" }),
  w("leadTime", 4, { metric: "lead_time", xAxis: "none", chartType: "NUMBER" }),
];

export const WORKSPACE_DASHBOARD: DefaultWidget[] = [
  ...HEADLINES,
  ...FLOW,
  w("openByProject", 6, { metric: "open_items", xAxis: "project", chartType: "BAR" }),
  w("openByPriority", 6, { metric: "open_items", xAxis: "priority", chartType: "BAR" }),
  ...SPEED,
  ...INTAKE,
];

export const PROJECT_DASHBOARD: DefaultWidget[] = [
  ...HEADLINES,
  ...FLOW,
  w("openByAssignee", 6, { metric: "open_items", xAxis: "assignee", chartType: "BAR" }),
  w("openByPriority", 6, { metric: "open_items", xAxis: "priority", chartType: "BAR" }),
  ...SPEED,
  ...INTAKE,
];
