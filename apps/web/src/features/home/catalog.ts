import {
  BarChart3,
  CalendarDays,
  CircleUserRound,
  Hash,
  Inbox,
  Layers,
  ListChecks,
  Mail,
  Pin,
  Repeat2,
  StickyNote,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { defaultZone } from "@dopl/shared/domain/home";
import { uuidv7 } from "@dopl/shared/ids";
import {
  HomeWidgetSchema,
  type HomeChart,
  type HomeWidget,
  type HomeWidgetType,
  type HomeZone,
  type NoteCount,
} from "@dopl/shared/schemas/home";
import type { Range } from "@dopl/shared/schemas/analytics";

export const WIDGET_ICONS: Record<HomeWidgetType, LucideIcon> = {
  pinnedNotes: Pin,
  recentNotes: StickyNote,
  taggedNotes: Hash,
  sharedNotes: Users,
  todos: ListChecks,
  today: Target,
  assigned: CircleUserRound,
  review: Repeat2,
  inbox: Inbox,
  week: CalendarDays,
  view: Layers,
  mail: Mail,
  chart: BarChart3,
};

/** The "Add widget" dialog, in groups (i18n: `home.catalog.<group>`). */
export const CATALOG: Array<{
  group: "notes" | "work" | "inbox" | "analytics";
  types: HomeWidgetType[];
}> = [
  {
    group: "notes",
    types: ["pinnedNotes", "recentNotes", "taggedNotes", "sharedNotes", "todos", "review"],
  },
  { group: "work", types: ["today", "assigned", "week", "view"] },
  { group: "inbox", types: ["inbox", "mail"] },
  { group: "analytics", types: ["chart"] },
];

/** What the member may add: mail needs a mailbox, charts need analytics. */
export interface HomeCapabilities {
  mail: boolean;
  analytics: boolean;
  views: boolean;
}

export function isAvailable(type: HomeWidgetType, caps: HomeCapabilities): boolean {
  if (type === "mail") return caps.mail;
  if (type === "chart") return caps.analytics;
  if (type === "view") return caps.views;
  return true;
}

/** How many pinned notes the pinned widget shows (the server preloads the same list). */
export const PINNED_NOTES_LIMIT = 24;

/** Widgets with settings (a gear in their menu). */
export const CONFIGURABLE: ReadonlySet<HomeWidgetType> = new Set([
  "recentNotes",
  "taggedNotes",
  "sharedNotes",
  "view",
  "chart",
]);

/** Widgets that need a choice before they can be added (which tag, view, chart). */
export const NEEDS_SETUP: ReadonlySet<HomeWidgetType> = new Set(["taggedNotes", "view", "chart"]);

/** The settings a widget form edits; each type reads the fields it has. */
export interface WidgetDraft {
  count?: NoteCount;
  tag?: string;
  viewId?: string;
  chart?: HomeChart;
  range?: Range;
}

export function draftOf(widget: HomeWidget): WidgetDraft {
  switch (widget.type) {
    case "recentNotes":
    case "sharedNotes":
      return { count: widget.count };
    case "taggedNotes":
      return { tag: widget.tag, count: widget.count };
    case "view":
      return { viewId: widget.viewId };
    case "chart":
      return { chart: widget.chart, range: widget.range };
    default:
      return {};
  }
}

export function defaultDraft(type: HomeWidgetType): WidgetDraft {
  switch (type) {
    case "recentNotes":
    case "sharedNotes":
    case "taggedNotes":
      return { count: 6 };
    case "chart":
      return { range: "90d" };
    default:
      return {};
  }
}

/** A widget from a type and its settings, or null while a required choice is missing. */
export function buildWidget(
  type: HomeWidgetType,
  draft: WidgetDraft,
  id: string = uuidv7(),
  zone: HomeZone = defaultZone(type),
): HomeWidget | null {
  const parsed = HomeWidgetSchema.safeParse({ id, type, zone, ...draft });
  return parsed.success ? parsed.data : null;
}
