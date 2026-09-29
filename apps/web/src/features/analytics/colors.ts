import { colorForString, tagColors, type TagColor } from "@dopl/shared/palette";
import { FIXED_ORDER, NONE_KEY, OTHER_KEY } from "@dopl/shared/domain/analytics";
import type { CategoryAxis, XAxis } from "@dopl/shared/schemas/analytics";
import type { KeyLabel } from "./types";

/**
 * Series colours (DESIGN_SYSTEM §6, D-099). Colour follows the entity, never
 * its rank, so filtering never repaints the survivors:
 * - state groups use the state tokens, states and projects/labels/types their own colour;
 * - people use the same stable colour as their avatar;
 * - fixed enums (priority, intake status/source) take the categorical order by position;
 * - "none" and "Other" are grey.
 */
export const CHART_SERIES = Array.from({ length: 8 }, (_, i) => `var(--color-chart-${i + 1})`);
export const CHART_OTHER = "var(--color-chart-other)";

const STATE_GROUP_TOKEN: Record<string, string> = {
  TRIAGE: "var(--color-state-triage)",
  BACKLOG: "var(--color-state-backlog)",
  UNSTARTED: "var(--color-state-unstarted)",
  STARTED: "var(--color-state-started)",
  COMPLETED: "var(--color-state-completed)",
  CANCELLED: "var(--color-state-cancelled)",
};

const isTag = (c: string | null | undefined): c is TagColor =>
  !!c && (tagColors as readonly string[]).includes(c);
const tagSolid = (c: TagColor) => `var(--color-tag-${c}-solid)`;
/** A stored colour: a tag name, or (for workflow states) a hex picked by the user. */
function stored(c: string | null | undefined): string | null {
  if (isTag(c)) return tagSolid(c);
  if (c && /^#[0-9a-f]{6}$/i.test(c)) return c;
  return null;
}

/** Colour for one key on a categorical dimension. */
export function keyColor(
  axis: CategoryAxis | null,
  key: string,
  labels: Record<string, KeyLabel>,
  index: number,
): string {
  if (key === NONE_KEY || key === OTHER_KEY) return CHART_OTHER;
  if (!axis) return CHART_SERIES[index % 8]!;
  if (axis === "stateGroup") return STATE_GROUP_TOKEN[key] ?? CHART_OTHER;
  if (axis === "assignee") return tagSolid(colorForString(key));
  const fixed = FIXED_ORDER[axis];
  if (fixed) return CHART_SERIES[Math.max(0, fixed.indexOf(key)) % 8]!;
  return stored(labels[key]?.color) ?? CHART_SERIES[index % 8]!;
}

/** Colours for a chart's series: fixed metric series take the first slots in order. */
export function seriesColors(
  series: string[],
  segment: CategoryAxis | null,
  labels: Record<string, KeyLabel>,
): Record<string, string> {
  const out: Record<string, string> = {};
  series.forEach((s, i) => {
    out[s] = segment ? keyColor(segment, s, labels, i) : CHART_SERIES[i % 8]!;
  });
  return out;
}

/** Donut slices are the x categories. */
export function sliceColors(
  x: string[],
  axis: XAxis,
  labels: Record<string, KeyLabel>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const cat =
    axis === "none" || axis === "day" || axis === "week" || axis === "month" ? null : axis;
  x.forEach((k, i) => {
    out[k] = keyColor(cat, k, labels, i);
  });
  return out;
}
