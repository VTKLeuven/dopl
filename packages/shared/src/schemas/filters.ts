import { z } from "zod";
import { DateOnlySchema, PrioritySchema, StateGroupSchema } from "./work-item";

export const OriginSchema = z.enum([
  "APP",
  "INTAKE_FORM",
  "INTAKE_GUEST",
  "EMAIL",
  "MESSAGE",
  "NOTE",
  "AGENT",
  "API",
  "IMPORT",
]);
export type Origin = z.infer<typeof OriginSchema>;

/**
 * Filter AST (DATA_MODEL §5). Stored in View.filters and ViewPreference.filters,
 * carried in the URL (`?f=`), compiled to SQL on the server
 * (apps/web/src/server/queries/filters.ts).
 *
 * Every field has a kind; the kind decides which operators and values are valid.
 */

export const FILTER_FIELDS = {
  state: { kind: "option", nullable: false },
  stateGroup: { kind: "option", nullable: false },
  priority: { kind: "option", nullable: false },
  type: { kind: "option", nullable: true },
  project: { kind: "option", nullable: false },
  parent: { kind: "option", nullable: true },
  createdBy: { kind: "user", nullable: true },
  origin: { kind: "option", nullable: false },
  assignee: { kind: "users", nullable: true },
  subscriber: { kind: "users", nullable: true },
  label: { kind: "options", nullable: true },
  startDate: { kind: "date", nullable: true },
  dueDate: { kind: "date", nullable: true },
  createdAt: { kind: "timestamp", nullable: false },
  updatedAt: { kind: "timestamp", nullable: false },
  completedAt: { kind: "timestamp", nullable: true },
  estimate: { kind: "number", nullable: true },
  title: { kind: "text", nullable: false },
  hasSubItems: { kind: "boolean", nullable: false },
  isBlocked: { kind: "boolean", nullable: false },
} as const satisfies Record<string, { kind: FieldKind; nullable: boolean }>;

export type FieldKind =
  | "option" // single-valued reference or enum
  | "options" // many-valued reference (labels)
  | "user" // single user reference (supports "me")
  | "users" // many users (supports "me")
  | "date" // calendar date
  | "timestamp"
  | "number"
  | "text"
  | "boolean";

export type FilterField = keyof typeof FILTER_FIELDS;
export const FilterFieldSchema = z.enum(
  Object.keys(FILTER_FIELDS) as [FilterField, ...FilterField[]],
);

export const OPERATORS = [
  "in",
  "notIn",
  "isEmpty",
  "isNotEmpty",
  "is",
  "before",
  "after",
  "between",
  "withinLast",
  "withinNext",
  "contains",
  "lt",
  "gt",
] as const;
export type FilterOperator = (typeof OPERATORS)[number];
export const FilterOperatorSchema = z.enum(OPERATORS);

const EMPTINESS = ["isEmpty", "isNotEmpty"] as const;
const DATE_OPS = ["is", "before", "after", "between", "withinLast", "withinNext"] as const;

export function operatorsFor(field: FilterField): FilterOperator[] {
  const { kind, nullable } = FILTER_FIELDS[field];
  const empty = nullable ? [...EMPTINESS] : [];
  switch (kind) {
    case "option":
    case "options":
    case "user":
    case "users":
      return ["in", "notIn", ...empty];
    case "date":
    case "timestamp":
      return [...DATE_OPS, ...empty];
    case "number":
      return ["is", "lt", "gt", ...empty];
    case "text":
      return ["contains"];
    case "boolean":
      return ["is"];
  }
}

/** Dynamic date tokens resolved at query time in the workspace time zone. */
export const DATE_TOKENS = [
  "today",
  "yesterday",
  "tomorrow",
  "startOfWeek",
  "endOfWeek",
  "startOfMonth",
  "endOfMonth",
] as const;
export type DateToken = (typeof DATE_TOKENS)[number];
export const DateValueSchema = z.union([DateOnlySchema, z.enum(DATE_TOKENS)]);
export type DateValue = z.infer<typeof DateValueSchema>;

export const RelativeSchema = z.object({
  amount: z.number().int().min(1).max(365),
  unit: z.enum(["day", "week", "month"]),
});
export type Relative = z.infer<typeof RelativeSchema>;

/** "me" stands for the signed-in user in user fields. */
export const ME = "me";

export interface FilterRule {
  /** Stable id for React keys in the builder; optional in stored ASTs. */
  id?: string;
  field: FilterField;
  operator: FilterOperator;
  value?: unknown;
}
export interface FilterGroup {
  id?: string;
  op: "and" | "or";
  items: Array<FilterGroup | FilterRule>;
}

export function isGroup(node: FilterGroup | FilterRule): node is FilterGroup {
  return "items" in node;
}

/** Validates the value shape for a field × operator pair; returns an error message or null. */
export function validateRule(rule: FilterRule): string | null {
  const { kind } = FILTER_FIELDS[rule.field];
  if (!operatorsFor(rule.field).includes(rule.operator))
    return `Operator ${rule.operator} is not valid for ${rule.field}`;
  const ok = (schema: z.ZodType) =>
    schema.safeParse(rule.value).success ? null : `Invalid value for ${rule.field}`;
  switch (rule.operator) {
    case "isEmpty":
    case "isNotEmpty":
      return null;
    case "in":
    case "notIn":
      if (rule.field === "priority") return ok(z.array(PrioritySchema).min(1));
      if (rule.field === "stateGroup") return ok(z.array(StateGroupSchema).min(1));
      if (rule.field === "origin") return ok(z.array(OriginSchema).min(1));
      if (kind === "user" || kind === "users")
        return ok(
          z
            .array(z.union([z.literal(ME), z.uuid()]))
            .min(1)
            .max(100),
        );
      return ok(z.array(z.uuid()).min(1).max(100));
    case "is":
      if (kind === "boolean") return ok(z.boolean());
      if (kind === "number") return ok(z.number());
      return ok(DateValueSchema);
    case "before":
    case "after":
      return ok(DateValueSchema);
    case "between":
      return ok(z.tuple([DateValueSchema, DateValueSchema]));
    case "withinLast":
    case "withinNext":
      return ok(RelativeSchema);
    case "contains":
      return ok(z.string().trim().min(1).max(200));
    case "lt":
    case "gt":
      return ok(z.number());
  }
}

const FilterRuleSchema: z.ZodType<FilterRule> = z
  .object({
    id: z.string().max(40).optional(),
    field: FilterFieldSchema,
    operator: FilterOperatorSchema,
    value: z.unknown().optional(),
  })
  .superRefine((rule, ctx) => {
    const err = validateRule(rule);
    if (err) ctx.addIssue({ code: "custom", message: err });
  });

export const FilterGroupSchema: z.ZodType<FilterGroup> = z.object({
  id: z.string().max(40).optional(),
  op: z.enum(["and", "or"]),
  get items() {
    return z.array(z.union([FilterGroupSchema, FilterRuleSchema])).max(50);
  },
});

export const EMPTY_FILTER: FilterGroup = { op: "and", items: [] };

/** Tolerant parse for stored/URL filters: anything invalid becomes the empty filter. */
export function parseFilter(input: unknown): FilterGroup {
  if (input && typeof input === "object" && Object.keys(input).length === 0) return EMPTY_FILTER;
  const res = FilterGroupSchema.safeParse(input);
  return res.success ? res.data : EMPTY_FILTER;
}

export function countRules(group: FilterGroup): number {
  return group.items.reduce((n, item) => n + (isGroup(item) ? countRules(item) : 1), 0);
}

export function depth(group: FilterGroup): number {
  return 1 + Math.max(0, ...group.items.filter(isGroup).map(depth));
}

/** Strips builder ids and empty groups so equal filters serialize equally. */
export function normalizeFilter(group: FilterGroup): FilterGroup {
  const items = group.items
    .map((item) =>
      isGroup(item)
        ? normalizeFilter(item)
        : {
            field: item.field,
            operator: item.operator,
            ...(item.value === undefined ? {} : { value: item.value }),
          },
    )
    .filter((item) => !isGroup(item) || item.items.length > 0);
  return { op: group.op, items };
}

export function isEmptyFilter(group: FilterGroup): boolean {
  return countRules(group) === 0;
}

/* ─────────────── quick filters (preset ASTs) ─────────────── */

export const QUICK_FILTERS = {
  mine: { field: "assignee", operator: "in", value: [ME] },
  dueThisWeek: { field: "dueDate", operator: "between", value: ["startOfWeek", "endOfWeek"] },
  overdue: { field: "dueDate", operator: "before", value: "today" },
  unassigned: { field: "assignee", operator: "isEmpty" },
  urgent: { field: "priority", operator: "in", value: ["URGENT", "HIGH"] },
} as const satisfies Record<string, FilterRule>;
export type QuickFilter = keyof typeof QUICK_FILTERS;

function sameRule(a: FilterRule, b: FilterRule) {
  return (
    a.field === b.field &&
    a.operator === b.operator &&
    JSON.stringify(a.value) === JSON.stringify(b.value)
  );
}

/** Quick filters live as top-level rules of an AND root. */
export function hasQuickFilter(group: FilterGroup, q: QuickFilter): boolean {
  return (
    group.op === "and" && group.items.some((i) => !isGroup(i) && sameRule(i, QUICK_FILTERS[q]))
  );
}

export function toggleQuickFilter(group: FilterGroup, q: QuickFilter): FilterGroup {
  const rule = QUICK_FILTERS[q];
  const root: FilterGroup = group.op === "and" ? group : { op: "and", items: [group] };
  return hasQuickFilter(root, q)
    ? { ...root, items: root.items.filter((i) => isGroup(i) || !sameRule(i, rule)) }
    : { ...root, items: [...root.items, JSON.parse(JSON.stringify(rule)) as FilterRule] };
}
