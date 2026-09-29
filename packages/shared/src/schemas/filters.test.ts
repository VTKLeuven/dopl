import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTER,
  FilterGroupSchema,
  countRules,
  hasQuickFilter,
  normalizeFilter,
  operatorsFor,
  parseFilter,
  toggleQuickFilter,
  validateRule,
  type FilterGroup,
} from "./filters";

const uuid = "0199a0f0-0000-7000-8000-000000000001";

describe("filter AST", () => {
  it("offers operators by field kind", () => {
    expect(operatorsFor("priority")).toEqual(["in", "notIn"]);
    expect(operatorsFor("type")).toEqual(["in", "notIn", "isEmpty", "isNotEmpty"]);
    expect(operatorsFor("dueDate")).toContain("withinNext");
    expect(operatorsFor("createdAt")).not.toContain("isEmpty");
    expect(operatorsFor("title")).toEqual(["contains"]);
    expect(operatorsFor("isBlocked")).toEqual(["is"]);
  });

  it("validates values per field and operator", () => {
    expect(validateRule({ field: "priority", operator: "in", value: ["HIGH"] })).toBeNull();
    expect(validateRule({ field: "priority", operator: "in", value: ["SEVERE"] })).not.toBeNull();
    expect(validateRule({ field: "priority", operator: "isEmpty" })).not.toBeNull();
    expect(validateRule({ field: "assignee", operator: "in", value: ["me", uuid] })).toBeNull();
    expect(validateRule({ field: "label", operator: "in", value: ["me"] })).not.toBeNull();
    expect(validateRule({ field: "label", operator: "in", value: [] })).not.toBeNull();
    expect(validateRule({ field: "dueDate", operator: "before", value: "today" })).toBeNull();
    expect(validateRule({ field: "dueDate", operator: "before", value: "someday" })).not.toBeNull();
    expect(
      validateRule({ field: "dueDate", operator: "between", value: ["2026-01-01", "endOfMonth"] }),
    ).toBeNull();
    expect(
      validateRule({ field: "dueDate", operator: "withinLast", value: { amount: 0, unit: "day" } }),
    ).not.toBeNull();
    expect(validateRule({ field: "title", operator: "contains", value: "  " })).not.toBeNull();
    expect(validateRule({ field: "hasSubItems", operator: "is", value: "yes" })).not.toBeNull();
    expect(validateRule({ field: "estimate", operator: "gt", value: 2 })).toBeNull();
    expect(validateRule({ field: "origin", operator: "in", value: ["EMAIL"] })).toBeNull();
  });

  it("parses nested groups and rejects invalid ones", () => {
    const f: FilterGroup = {
      op: "and",
      items: [
        { field: "priority", operator: "in", value: ["HIGH"] },
        { op: "or", items: [{ field: "assignee", operator: "isEmpty" }] },
      ],
    };
    expect(FilterGroupSchema.safeParse(f).success).toBe(true);
    expect(parseFilter(f)).toEqual(f);
    expect(parseFilter({})).toEqual(EMPTY_FILTER);
    expect(parseFilter({ op: "xor", items: [] })).toEqual(EMPTY_FILTER);
    expect(
      parseFilter({ op: "and", items: [{ field: "priority", operator: "in", value: ["NOPE"] }] }),
    ).toEqual(EMPTY_FILTER);
    expect(countRules(f)).toBe(2);
  });

  it("normalizes builder ids and empty groups away", () => {
    expect(
      normalizeFilter({
        id: "root",
        op: "and",
        items: [
          { id: "r1", field: "assignee", operator: "isEmpty" },
          { id: "g1", op: "or", items: [] },
        ],
      }),
    ).toEqual({ op: "and", items: [{ field: "assignee", operator: "isEmpty" }] });
  });

  it("toggles quick filters as top-level rules", () => {
    const on = toggleQuickFilter(EMPTY_FILTER, "mine");
    expect(hasQuickFilter(on, "mine")).toBe(true);
    const both = toggleQuickFilter(on, "overdue");
    expect(countRules(both)).toBe(2);
    const off = toggleQuickFilter(both, "mine");
    expect(hasQuickFilter(off, "mine")).toBe(false);
    expect(hasQuickFilter(off, "overdue")).toBe(true);
    // An OR root gets wrapped so the quick filter narrows the whole thing.
    const or: FilterGroup = { op: "or", items: [{ field: "assignee", operator: "isEmpty" }] };
    const wrapped = toggleQuickFilter(or, "urgent");
    expect(wrapped.op).toBe("and");
    expect(wrapped.items[0]).toEqual(or);
  });
});
