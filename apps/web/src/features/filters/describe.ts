import { format, parseISO } from "date-fns";
import {
  FILTER_FIELDS,
  ME,
  type DateValue,
  type FilterField,
  type FilterOperator,
  type FilterRule,
  type Relative,
} from "@dopl/shared/schemas/filters";
import type { FilterSource } from "./source";

export type FiltersT = (key: string, values?: Record<string, string | number>) => string;

/** Operator label depends on the field's kind ("is" vs "includes"). */
export function operatorLabel(t: FiltersT, field: FilterField, op: FilterOperator): string {
  const { kind } = FILTER_FIELDS[field];
  const many = kind === "users" || kind === "options";
  switch (op) {
    case "in":
      return many ? t("op.includes") : t("op.is");
    case "notIn":
      return many ? t("op.excludes") : t("op.isNot");
    case "is":
      return kind === "number" ? "=" : t("op.is");
    case "lt":
      return "<";
    case "gt":
      return ">";
    default:
      return t(`op.${op}`);
  }
}

export function dateValueLabel(t: FiltersT, v: DateValue): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? format(parseISO(v), "d MMM yyyy") : t(`token.${v}`);
}

export function relativeLabel(t: FiltersT, r: Relative): string {
  return t(`unit.${r.unit}`, { count: r.amount });
}

/** Names for the ids in an option rule. */
export function optionLabels(
  t: FiltersT,
  tItems: FiltersT,
  field: FilterField,
  values: string[],
  source: FilterSource,
): string[] {
  return values.map((v) => {
    switch (field) {
      case "state":
        return source.states.find((s) => s.id === v)?.name ?? "?";
      case "stateGroup":
        return t(`stateGroup.${v}`);
      case "priority":
        return tItems(`priority.${v}`);
      case "type":
        return source.types.find((x) => x.id === v)?.name ?? "?";
      case "label":
        return source.labels.find((x) => x.id === v)?.name ?? "?";
      case "project":
        return source.projects?.find((x) => x.id === v)?.name ?? "?";
      case "origin":
        return t(`origin.${v}`);
      case "assignee":
      case "subscriber":
      case "createdBy":
        return v === ME ? t("me") : (source.members.find((m) => m.id === v)?.name ?? "?");
      default:
        return v;
    }
  });
}

/** Short value text for a chip ("High, Urgent", "Today", "last 7 days"). */
export function valueSummary(
  t: FiltersT,
  tItems: FiltersT,
  rule: FilterRule,
  source: FilterSource,
): string {
  switch (rule.operator) {
    case "isEmpty":
    case "isNotEmpty":
      return "";
    case "in":
    case "notIn": {
      const names = optionLabels(t, tItems, rule.field, rule.value as string[], source);
      return names.length > 2
        ? `${names.slice(0, 2).join(", ")} +${names.length - 2}`
        : names.join(", ");
    }
    case "is":
      if (typeof rule.value === "boolean") return rule.value ? t("yes") : t("no");
      if (typeof rule.value === "number") return String(rule.value);
      return dateValueLabel(t, rule.value as DateValue);
    case "before":
    case "after":
      return dateValueLabel(t, rule.value as DateValue);
    case "between": {
      const [a, b] = rule.value as [DateValue, DateValue];
      return `${dateValueLabel(t, a)} – ${dateValueLabel(t, b)}`;
    }
    case "withinLast":
    case "withinNext":
      return relativeLabel(t, rule.value as Relative);
    case "contains":
      return `“${String(rule.value)}”`;
    case "lt":
    case "gt":
      return String(rule.value);
  }
}
