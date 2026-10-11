import {
  HOME_MAX_WIDGETS,
  HomeWidgetSchema,
  type HomeChart,
  type HomeLayout,
  type HomeWidget,
  type HomeWidgetType,
  type HomeZone,
} from "../schemas/home";
import type { Priority, StateGroup } from "../schemas/work-item";
import { WORKSPACE_DASHBOARD, type DefaultWidget } from "./dashboards";

/**
 * Home's widget layout (D-141): pure helpers shared by the server (parsing
 * what's stored, validating what's saved) and the client (optimistic edits).
 */

/** What a member sees until they customize: notes first, today on the side. */
export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  widgets: [
    { id: "pinned", type: "pinnedNotes", zone: "main" },
    { id: "recent", type: "recentNotes", zone: "main", count: 8 },
    { id: "today", type: "today", zone: "side" },
    { id: "review", type: "review", zone: "side" },
    { id: "todos", type: "todos", zone: "side" },
    { id: "inbox", type: "inbox", zone: "side" },
  ],
};

/** Widgets that may appear more than once, because each copy shows something else. */
const REPEATABLE: ReadonlySet<HomeWidgetType> = new Set(["taggedNotes", "view", "chart"]);
export const isRepeatable = (type: HomeWidgetType) => REPEATABLE.has(type);

/** Where a newly added widget goes: notes and lists in the main column, wide charts on top. */
export function defaultZone(type: HomeWidgetType): HomeZone {
  switch (type) {
    case "pinnedNotes":
    case "recentNotes":
    case "taggedNotes":
    case "sharedNotes":
    case "assigned":
    case "view":
      return "main";
    case "week":
    case "chart":
      return "top";
    case "todos":
    case "today":
    case "review":
    case "inbox":
    case "mail":
      return "side";
  }
}

/**
 * Reads a stored layout leniently: widgets that no longer parse (a removed
 * type, a bad config) are dropped one by one instead of resetting the page,
 * and duplicates are dropped the way `layoutProblem` would refuse them.
 * `null` means nothing usable is stored: show the default.
 */
export function parseHomeLayout(raw: unknown): HomeLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const list = (raw as { widgets?: unknown }).widgets;
  if (!Array.isArray(list)) return null;
  const ids = new Set<string>();
  const types = new Set<HomeWidgetType>();
  const widgets: HomeWidget[] = [];
  for (const entry of list) {
    const parsed = HomeWidgetSchema.safeParse(entry);
    if (!parsed.success) continue;
    const w = parsed.data;
    if (ids.has(w.id) || (!isRepeatable(w.type) && types.has(w.type))) continue;
    ids.add(w.id);
    types.add(w.type);
    widgets.push(w);
    if (widgets.length === HOME_MAX_WIDGETS) break;
  }
  return { widgets };
}

/** Why a layout can't be saved as is (the schema checks each widget's shape). */
export function layoutProblem(layout: HomeLayout): "duplicate_id" | "duplicate_widget" | null {
  const ids = new Set<string>();
  const types = new Set<HomeWidgetType>();
  for (const w of layout.widgets) {
    if (ids.has(w.id)) return "duplicate_id";
    if (!isRepeatable(w.type) && types.has(w.type)) return "duplicate_widget";
    ids.add(w.id);
    types.add(w.type);
  }
  return null;
}

export function widgetsIn(layout: HomeLayout, zone: HomeZone): HomeWidget[] {
  return layout.widgets.filter((w) => w.zone === zone);
}

export function hasWidget(layout: HomeLayout, type: HomeWidgetType): boolean {
  return layout.widgets.some((w) => w.type === type);
}

export function canAdd(layout: HomeLayout, type: HomeWidgetType): boolean {
  if (layout.widgets.length >= HOME_MAX_WIDGETS) return false;
  return isRepeatable(type) || !hasWidget(layout, type);
}

/** Appends to the end of the widget's zone. */
export function addWidget(layout: HomeLayout, widget: HomeWidget): HomeLayout {
  return { widgets: [...layout.widgets, widget] };
}

export function removeWidget(layout: HomeLayout, id: string): HomeLayout {
  return { widgets: layout.widgets.filter((w) => w.id !== id) };
}

/** Swaps in a widget's new settings, keeping its place. */
export function replaceWidget(layout: HomeLayout, widget: HomeWidget): HomeLayout {
  return { widgets: layout.widgets.map((w) => (w.id === widget.id ? widget : w)) };
}

/**
 * Puts a widget at `index` among the widgets of `zone` (counted without the
 * widget itself), so dropping it on the third card of a column makes it the
 * third. An index past the end appends.
 */
export function moveWidget(
  layout: HomeLayout,
  id: string,
  zone: HomeZone,
  index: number,
): HomeLayout {
  const widget = layout.widgets.find((w) => w.id === id);
  if (!widget) return layout;
  const rest = layout.widgets.filter((w) => w.id !== id);
  const moved = { ...widget, zone };
  const inZone = rest.filter((w) => w.zone === zone);
  const anchor = inZone[Math.max(0, index)];
  if (!anchor) {
    const last = inZone.at(-1);
    const at = last ? rest.indexOf(last) + 1 : rest.length;
    return { widgets: [...rest.slice(0, at), moved, ...rest.slice(at)] };
  }
  const at = rest.indexOf(anchor);
  return { widgets: [...rest.slice(0, at), moved, ...rest.slice(at)] };
}

/** One step up or down within the widget's zone (the menu's keyboard-friendly move). */
export function shiftWidget(layout: HomeLayout, id: string, delta: -1 | 1): HomeLayout {
  const widget = layout.widgets.find((w) => w.id === id);
  if (!widget) return layout;
  const index = widgetsIn(layout, widget.zone).findIndex((w) => w.id === id);
  const next = index + delta;
  if (next < 0 || next >= widgetsIn(layout, widget.zone).length) return layout;
  return moveWidget(layout, id, widget.zone, next);
}

/** The analytics spec behind a chart widget (the workspace dashboard's own definition). */
export function homeChart(key: HomeChart): DefaultWidget {
  const found = WORKSPACE_DASHBOARD.find((w) => w.key === key);
  if (!found) throw new Error(`Unknown home chart: ${key}`);
  return found;
}

/* ───────────────────────── the Today widget ───────────────────────── */

export type AgendaWhen =
  | { kind: "overdue"; date: string }
  | { kind: "today" }
  | { kind: "week"; date: string }
  | { kind: "inProgress" };

interface AgendaItemInput {
  dueDate: string | null;
  stateGroup: StateGroup;
  priority: Priority;
}
interface AgendaTodoInput {
  dueDate: string | null;
  checked: boolean;
}

export type AgendaEntry<I, T> =
  { kind: "item"; item: I; when: AgendaWhen } | { kind: "todo"; todo: T; when: AgendaWhen };

const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
const WHEN_RANK: Record<AgendaWhen["kind"], number> = {
  overdue: 0,
  today: 1,
  week: 2,
  inProgress: 3,
};

function dueWhen(due: string | null, today: string, weekEnd: string): AgendaWhen | null {
  if (!due || due > weekEnd) return null;
  if (due < today) return { kind: "overdue", date: due };
  if (due === today) return { kind: "today" };
  return { kind: "week", date: due };
}

/**
 * What needs you this week, in one list: items assigned to you that are due
 * by the end of the week (or overdue) or in progress, and open to-dos due by
 * then. Overdue first, then today, then the rest of the week by day, then
 * whatever is in progress without a date this week. Within a slot, items
 * come before to-dos and higher priority first.
 */
export function todayAgenda<I extends AgendaItemInput, T extends AgendaTodoInput>(
  items: I[],
  todos: T[],
  today: string,
  weekEnd: string,
): Array<AgendaEntry<I, T>> {
  const entries: Array<AgendaEntry<I, T>> = [];
  for (const item of items) {
    const when =
      dueWhen(item.dueDate, today, weekEnd) ??
      (item.stateGroup === "STARTED" ? ({ kind: "inProgress" } as const) : null);
    if (when) entries.push({ kind: "item", item, when });
  }
  for (const todo of todos) {
    if (todo.checked) continue;
    const when = dueWhen(todo.dueDate, today, weekEnd);
    if (when) entries.push({ kind: "todo", todo, when });
  }
  const dateOf = (w: AgendaWhen) => ("date" in w ? w.date : "");
  return entries
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        WHEN_RANK[a.e.when.kind] - WHEN_RANK[b.e.when.kind] ||
        (dateOf(a.e.when) < dateOf(b.e.when) ? -1 : dateOf(a.e.when) > dateOf(b.e.when) ? 1 : 0) ||
        Number(a.e.kind === "todo") - Number(b.e.kind === "todo") ||
        (a.e.kind === "item" && b.e.kind === "item"
          ? PRIORITY_RANK[a.e.item.priority] - PRIORITY_RANK[b.e.item.priority]
          : 0) ||
        a.i - b.i,
    )
    .map(({ e }) => e);
}
