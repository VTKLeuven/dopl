import { z } from "zod";
import { RangeSchema } from "./analytics";
import type { DefaultWidgetKey } from "../domain/dashboards";
import { TAG_MAX_LENGTH } from "../domain/notes";

/**
 * Home is a per-member set of widgets (D-141), stored in
 * `WorkspaceMember.preferences.home`. Each widget sits in one of three zones
 * and its place in the array is its order within that zone.
 */

/** Full width above the columns, the wide main column, the narrow side column. */
export const HOME_ZONES = ["top", "main", "side"] as const;
export type HomeZone = (typeof HOME_ZONES)[number];
export const HomeZoneSchema = z.enum(HOME_ZONES);

export const HOME_WIDGET_TYPES = [
  "pinnedNotes",
  "recentNotes",
  "taggedNotes",
  "sharedNotes",
  "todos",
  "today",
  "assigned",
  "review",
  "inbox",
  "week",
  "view",
  "mail",
  "chart",
] as const;
export type HomeWidgetType = (typeof HOME_WIDGET_TYPES)[number];

/** How many cards a notes widget shows. */
export const NOTE_COUNTS = [4, 6, 8, 12] as const;
export type NoteCount = (typeof NOTE_COUNTS)[number];
const NoteCountSchema = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(12)]);

/** The built-in workspace charts a chart widget can show (analytics `default.*`). */
export const HOME_CHARTS = [
  "open",
  "completed",
  "overdue",
  "flow",
  "openByState",
  "openOverTime",
  "openByProject",
  "openByPriority",
  "throughput",
  "cycleTime",
  "intakeVolume",
  "timeToTriage",
  "leadTime",
] as const satisfies readonly DefaultWidgetKey[];
export type HomeChart = (typeof HOME_CHARTS)[number];

/** Widget ids are opaque; the default layout uses readable ones ("pinned"). */
const base = { id: z.string().trim().min(1).max(40), zone: HomeZoneSchema };
const TagPathSchema = z.string().trim().toLowerCase().min(1).max(TAG_MAX_LENGTH);

export const HomeWidgetSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("pinnedNotes") }),
  z.object({ ...base, type: z.literal("recentNotes"), count: NoteCountSchema }),
  z.object({ ...base, type: z.literal("taggedNotes"), tag: TagPathSchema, count: NoteCountSchema }),
  z.object({ ...base, type: z.literal("sharedNotes"), count: NoteCountSchema }),
  z.object({ ...base, type: z.literal("todos") }),
  z.object({ ...base, type: z.literal("today") }),
  z.object({ ...base, type: z.literal("assigned") }),
  z.object({ ...base, type: z.literal("review") }),
  z.object({ ...base, type: z.literal("inbox") }),
  z.object({ ...base, type: z.literal("week") }),
  z.object({ ...base, type: z.literal("view"), viewId: z.uuid() }),
  z.object({ ...base, type: z.literal("mail") }),
  z.object({ ...base, type: z.literal("chart"), chart: z.enum(HOME_CHARTS), range: RangeSchema }),
]);
export type HomeWidget = z.infer<typeof HomeWidgetSchema>;
export type HomeWidgetOf<T extends HomeWidgetType> = Extract<HomeWidget, { type: T }>;

/** More than this stops being a home page. */
export const HOME_MAX_WIDGETS = 20;

export const HomeLayoutSchema = z.object({
  widgets: z.array(HomeWidgetSchema).max(HOME_MAX_WIDGETS),
});
export type HomeLayout = z.infer<typeof HomeLayoutSchema>;

/** Saving: a full layout, or `null` to go back to the default. */
export const SaveHomeLayoutSchema = z.object({ layout: HomeLayoutSchema.nullable() });
export type SaveHomeLayoutInput = z.input<typeof SaveHomeLayoutSchema>;
