import "server-only";
import { TZDate } from "@date-fns/tz";
import type { Prisma } from "@dopl/db";
import {
  addDays,
  relativeRange,
  resolveDate,
  todayIn,
  type DateContext,
} from "@dopl/shared/domain/dates";
import {
  FILTER_FIELDS,
  ME,
  isGroup,
  type DateValue,
  type FilterField,
  type FilterGroup,
  type FilterRule,
  type Relative,
} from "@dopl/shared/schemas/filters";
import { OPEN_GROUPS } from "@dopl/shared/schemas/work-item";

/**
 * Filter AST → Prisma `where` (DATA_MODEL §5). The caller ANDs the result with
 * the access scope; this module only expresses the user's filter.
 *
 * Semantics worth knowing:
 * - "is none of" on a nullable field keeps items where the field is empty.
 * - Date rules compare calendar days in the workspace time zone; timestamp
 *   rules convert those days to instants in the same zone.
 */
export interface CompileContext {
  userId: string;
  timeZone: string;
  weekStartsOn: number;
  now?: Date;
}

type Where = Prisma.WorkItemWhereInput;

export function compileFilter(group: FilterGroup, ctx: CompileContext): Where {
  const dates: DateContext = {
    today: todayIn(ctx.timeZone, ctx.now),
    weekStartsOn: ctx.weekStartsOn,
  };
  return compileGroup(group, ctx, dates);
}

function compileGroup(group: FilterGroup, ctx: CompileContext, dates: DateContext): Where {
  const parts = group.items
    .map((item) => (isGroup(item) ? compileGroup(item, ctx, dates) : compileRule(item, ctx, dates)))
    .filter((w) => Object.keys(w).length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0] as Where;
  return group.op === "and" ? { AND: parts } : { OR: parts };
}

const OPTION_COLUMN = {
  state: "stateId",
  stateGroup: "stateGroup",
  priority: "priority",
  type: "typeId",
  project: "projectId",
  parent: "parentId",
  origin: "origin",
  createdBy: "createdById",
} as const satisfies Partial<Record<FilterField, keyof Where>>;

function compileRule(rule: FilterRule, ctx: CompileContext, dates: DateContext): Where {
  const { kind, nullable } = FILTER_FIELDS[rule.field];
  switch (kind) {
    case "option":
    case "user": {
      const col = OPTION_COLUMN[rule.field as keyof typeof OPTION_COLUMN];
      const values = ids(rule, ctx);
      switch (rule.operator) {
        case "in":
          return { [col]: { in: values } };
        case "notIn":
          return nullable
            ? { OR: [{ [col]: { notIn: values } }, { [col]: null }] }
            : { [col]: { notIn: values } };
        case "isEmpty":
          return { [col]: null };
        case "isNotEmpty":
          return { [col]: { not: null } };
        default:
          return {};
      }
    }
    case "users":
    case "options": {
      const rel =
        rule.field === "assignee" ? "assignees" : rule.field === "label" ? "labels" : "subscribers";
      const key = rule.field === "label" ? "labelId" : "userId";
      switch (rule.operator) {
        case "in":
          return { [rel]: { some: { [key]: { in: ids(rule, ctx) } } } };
        case "notIn":
          return { [rel]: { none: { [key]: { in: ids(rule, ctx) } } } };
        case "isEmpty":
          return { [rel]: { none: {} } };
        case "isNotEmpty":
          return { [rel]: { some: {} } };
        default:
          return {};
      }
    }
    case "date":
      return dateRule(rule.field as "startDate" | "dueDate", rule, dates);
    case "timestamp":
      return timestampRule(
        rule.field as "createdAt" | "updatedAt" | "completedAt",
        rule,
        ctx,
        dates,
      );
    case "number": {
      const v = rule.value as number;
      switch (rule.operator) {
        case "is":
          return { estimate: v };
        case "lt":
          return { estimate: { lt: v } };
        case "gt":
          return { estimate: { gt: v } };
        case "isEmpty":
          return { estimate: null };
        case "isNotEmpty":
          return { estimate: { not: null } };
        default:
          return {};
      }
    }
    case "text":
      return { title: { contains: String(rule.value).trim(), mode: "insensitive" } };
    case "boolean": {
      const yes = rule.value === true;
      if (rule.field === "hasSubItems") return yes ? { childCount: { gt: 0 } } : { childCount: 0 };
      const blocking: Where = { stateGroup: { in: OPEN_GROUPS }, deletedAt: null };
      return yes
        ? { relationsIn: { some: { type: "BLOCKS", source: blocking } } }
        : { relationsIn: { none: { type: "BLOCKS", source: blocking } } };
    }
  }
}

function ids(rule: FilterRule, ctx: CompileContext): string[] {
  const values = Array.isArray(rule.value) ? (rule.value as string[]) : [];
  return values.map((v) => (v === ME ? ctx.userId : v));
}

/** DATE columns hold UTC midnight for the calendar day. */
function day(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function range(rule: FilterRule, dates: DateContext): [string, string] | null {
  switch (rule.operator) {
    case "is": {
      const d = resolveDate(rule.value as DateValue, dates);
      return [d, d];
    }
    case "between": {
      const [a, b] = (rule.value as [DateValue, DateValue]).map((v) => resolveDate(v, dates)) as [
        string,
        string,
      ];
      return a <= b ? [a, b] : [b, a];
    }
    case "withinLast":
    case "withinNext":
      return relativeRange(rule.operator, rule.value as Relative, dates);
    default:
      return null;
  }
}

function dateRule(col: "startDate" | "dueDate", rule: FilterRule, dates: DateContext): Where {
  switch (rule.operator) {
    case "before":
      return { [col]: { lt: day(resolveDate(rule.value as DateValue, dates)) } };
    case "after":
      return { [col]: { gt: day(resolveDate(rule.value as DateValue, dates)) } };
    case "isEmpty":
      return { [col]: null };
    case "isNotEmpty":
      return { [col]: { not: null } };
    default: {
      const r = range(rule, dates);
      return r ? { [col]: { gte: day(r[0]), lte: day(r[1]) } } : {};
    }
  }
}

function timestampRule(
  col: "createdAt" | "updatedAt" | "completedAt",
  rule: FilterRule,
  ctx: CompileContext,
  dates: DateContext,
): Where {
  const start = (date: string) => startOfDayIn(date, ctx.timeZone);
  switch (rule.operator) {
    case "before":
      return { [col]: { lt: start(resolveDate(rule.value as DateValue, dates)) } };
    case "after":
      return { [col]: { gte: start(addDays(resolveDate(rule.value as DateValue, dates), 1)) } };
    case "isEmpty":
      return { [col]: null };
    case "isNotEmpty":
      return { [col]: { not: null } };
    default: {
      const r = range(rule, dates);
      return r ? { [col]: { gte: start(r[0]), lt: start(addDays(r[1], 1)) } } : {};
    }
  }
}

/** The instant a calendar day starts in a time zone. */
export function startOfDayIn(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, 0, timeZone).getTime());
}
