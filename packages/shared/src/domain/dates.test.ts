import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  diffDays,
  eachDay,
  endOfMonth,
  endOfWeek,
  relativeRange,
  resolveDate,
  startOfWeek,
  todayIn,
} from "./dates";

const ctx = { today: "2026-09-30", weekStartsOn: 1 }; // a Wednesday

describe("calendar dates", () => {
  it("adds days and months, clamping month ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
  });

  it("finds week bounds for Monday and Sunday starts", () => {
    expect(startOfWeek("2026-09-30", 1)).toBe("2026-09-28");
    expect(endOfWeek("2026-09-30", 1)).toBe("2026-10-04");
    expect(startOfWeek("2026-09-30", 0)).toBe("2026-09-27");
    expect(startOfWeek("2026-09-28", 1)).toBe("2026-09-28");
    expect(startOfWeek("2026-09-27", 1)).toBe("2026-09-21"); // Sunday belongs to the week before
  });

  it("resolves dynamic tokens", () => {
    expect(resolveDate("today", ctx)).toBe("2026-09-30");
    expect(resolveDate("yesterday", ctx)).toBe("2026-09-29");
    expect(resolveDate("tomorrow", ctx)).toBe("2026-10-01");
    expect(resolveDate("startOfWeek", ctx)).toBe("2026-09-28");
    expect(resolveDate("endOfWeek", ctx)).toBe("2026-10-04");
    expect(resolveDate("startOfMonth", ctx)).toBe("2026-09-01");
    expect(resolveDate("endOfMonth", ctx)).toBe("2026-09-30");
    expect(resolveDate("2026-01-02", ctx)).toBe("2026-01-02");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });

  it("builds inclusive relative ranges", () => {
    expect(relativeRange("withinLast", { amount: 7, unit: "day" }, ctx)).toEqual([
      "2026-09-23",
      "2026-09-30",
    ]);
    expect(relativeRange("withinNext", { amount: 1, unit: "month" }, ctx)).toEqual([
      "2026-09-30",
      "2026-10-30",
    ]);
  });

  it("computes today in a time zone", () => {
    const late = new Date("2026-09-29T22:30:00Z");
    expect(todayIn("Europe/Brussels", late)).toBe("2026-09-30");
    expect(todayIn("America/New_York", late)).toBe("2026-09-29");
  });

  it("counts and lists days", () => {
    expect(diffDays("2026-10-02", "2026-09-30")).toBe(2);
    expect(eachDay("2026-09-29", "2026-10-01")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
  });
});
