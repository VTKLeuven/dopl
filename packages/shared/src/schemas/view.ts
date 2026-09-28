import { z } from "zod";

export const GroupKeySchema = z.enum(["state", "priority", "assignee", "label", "type", "none"]);
export type GroupKey = z.infer<typeof GroupKeySchema>;
export const OrderFieldSchema = z.enum(["manual", "priority", "dueDate", "startDate", "createdAt", "updatedAt", "title", "sequence"]);
export type OrderField = z.infer<typeof OrderFieldSchema>;
export const PropertyKeySchema = z.enum(["state", "priority", "assignees", "labels", "dueDate", "startDate", "estimate", "type", "subItems", "identifier", "updatedAt", "createdAt"]);
export type PropertyKey = z.infer<typeof PropertyKeySchema>;

export const DisplayOptionsSchema = z.object({
  layout: z.enum(["LIST", "BOARD", "CALENDAR", "TABLE", "TIMELINE"]).default("LIST"),
  groupBy: GroupKeySchema.default("state"),
  subGroupBy: GroupKeySchema.default("none"),
  orderBy: z.object({ field: OrderFieldSchema, dir: z.enum(["asc", "desc"]) }).default({ field: "manual", dir: "asc" }),
  showSubItems: z.boolean().default(true),
  showEmptyGroups: z.boolean().default(true),
  /** D-053: done items are hidden by default. */
  completed: z.enum(["hide", "recent", "show"]).default("hide"),
  properties: z.array(PropertyKeySchema).default(["identifier", "state", "priority", "labels", "dueDate", "assignees", "subItems"]),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  table: z.object({ columns: z.array(z.object({ id: z.string(), width: z.number() })) }).optional(),
  calendar: z.object({ mode: z.enum(["month", "week"]), dateField: z.enum(["dueDate", "startDate"]) }).optional(),
  timeline: z.object({ zoom: z.enum(["week", "month", "quarter"]) }).optional(),
});
export type DisplayOptions = z.infer<typeof DisplayOptionsSchema>;
export const defaultDisplayOptions: DisplayOptions = DisplayOptionsSchema.parse({});
