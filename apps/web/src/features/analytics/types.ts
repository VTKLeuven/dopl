import type { ChartData } from "@dopl/shared/domain/analytics";
import type { WidgetSpec, WidgetWidth } from "@dopl/shared/schemas/analytics";

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

export interface DashboardSummary {
  id: string;
  name: string;
  description: string | null;
  visibility: "PRIVATE" | "WORKSPACE";
  projectId: string | null;
  project: { identifier: string; name: string; color: string | null } | null;
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
