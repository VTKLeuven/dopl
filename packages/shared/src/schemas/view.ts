import { z } from "zod";

export const GroupKeySchema = z.enum([
  "state",
  "stateGroup",
  "project",
  "priority",
  "assignee",
  "label",
  "type",
  "none",
]);
export type GroupKey = z.infer<typeof GroupKeySchema>;
export const OrderFieldSchema = z.enum([
  "manual",
  "priority",
  "dueDate",
  "startDate",
  "createdAt",
  "updatedAt",
  "title",
  "sequence",
]);
export type OrderField = z.infer<typeof OrderFieldSchema>;
export const PropertyKeySchema = z.enum([
  "state",
  "priority",
  "assignees",
  "labels",
  "dueDate",
  "startDate",
  "estimate",
  "type",
  "subItems",
  "identifier",
  "updatedAt",
  "createdAt",
]);
export type PropertyKey = z.infer<typeof PropertyKeySchema>;

export const DisplayOptionsSchema = z.object({
  layout: z.enum(["LIST", "BOARD", "CALENDAR", "TABLE", "TIMELINE"]).default("LIST"),
  groupBy: GroupKeySchema.default("state"),
  subGroupBy: GroupKeySchema.default("none"),
  orderBy: z
    .object({ field: OrderFieldSchema, dir: z.enum(["asc", "desc"]) })
    .default({ field: "manual", dir: "asc" }),
  showSubItems: z.boolean().default(true),
  showEmptyGroups: z.boolean().default(true),
  /** D-053: done items are hidden by default. */
  completed: z.enum(["hide", "recent", "show"]).default("hide"),
  properties: z
    .array(PropertyKeySchema)
    .default(["identifier", "state", "priority", "labels", "dueDate", "assignees", "subItems"]),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  table: z.object({ columns: z.array(z.object({ id: z.string(), width: z.number() })) }).optional(),
  calendar: z
    .object({ mode: z.enum(["month", "week"]), dateField: z.enum(["dueDate", "startDate"]) })
    .optional(),
  timeline: z.object({ zoom: z.enum(["week", "month", "quarter"]) }).optional(),
});
export type DisplayOptions = z.infer<typeof DisplayOptionsSchema>;
export const defaultDisplayOptions: DisplayOptions = DisplayOptionsSchema.parse({});

/* ─────────────── saved views ─────────────── */

export const ViewNameSchema = z.string().trim().min(1, "Give the view a name.").max(80);

export const CreateViewSchema = z.object({
  /** null for a workspace (cross-project) view. */
  projectId: z.uuid().nullable(),
  name: ViewNameSchema,
  description: z.string().trim().max(500).nullish(),
  visibility: z.enum(["PRIVATE", "WORKSPACE"]).default("PRIVATE"),
  filters: z.unknown(),
  displayOptions: z.unknown(),
});
export type CreateViewInput = z.input<typeof CreateViewSchema>;

export const UpdateViewSchema = z.object({
  id: z.uuid(),
  name: ViewNameSchema.optional(),
  description: z.string().trim().max(500).nullish(),
  visibility: z.enum(["PRIVATE", "WORKSPACE"]).optional(),
  filters: z.unknown().optional(),
  displayOptions: z.unknown().optional(),
  isLocked: z.boolean().optional(),
});
export type UpdateViewInput = z.input<typeof UpdateViewSchema>;
