import { describe, expect, it } from "vitest";
import {
  aggregate,
  aggregateSnapshots,
  bucketsBetween,
  isEmptyChart,
  orderKeys,
  percentile,
  previousWindow,
  type AggregateContext,
  type IntakeRow,
  type ItemRow,
} from "./analytics";

// September 2026 in Brussels (CEST, UTC+2), weeks start on Monday.
const ctx: AggregateContext = {
  timeZone: "Europe/Brussels",
  weekStartsOn: 1,
  from: "2026-09-01",
  to: "2026-09-30",
};

const item = (p: Partial<ItemRow> & Pick<ItemRow, "id" | "createdAt">): ItemRow => ({
  projectId: "p1",
  stateId: "s-backlog",
  stateGroup: "BACKLOG",
  priority: "NONE",
  typeId: null,
  assigneeIds: [],
  labelIds: [],
  startedAt: null,
  completedAt: null,
  ...p,
});
const t = (iso: string) => new Date(iso);

// Hand-computed expectations are in the comments next to each row.
const items: ItemRow[] = [
  // created Wed 2 Sep (week of 31 Aug); cycle 2 d, lead 3 d
  item({
    id: "A",
    createdAt: t("2026-09-02T10:00:00Z"),
    startedAt: t("2026-09-03T10:00:00Z"),
    completedAt: t("2026-09-05T10:00:00Z"),
    stateGroup: "COMPLETED",
    stateId: "s-done",
    priority: "HIGH",
    assigneeIds: ["u1", "u2"],
    labelIds: ["l1"],
  }),
  // created Tue 8 Sep (week of 7 Sep), completed 18 Sep (week of 14 Sep); cycle 10 d, lead 10 d
  item({
    id: "B",
    createdAt: t("2026-09-08T10:00:00Z"),
    startedAt: t("2026-09-08T10:00:00Z"),
    completedAt: t("2026-09-18T10:00:00Z"),
    stateGroup: "COMPLETED",
    stateId: "s-done",
    priority: "LOW",
    assigneeIds: ["u1"],
  }),
  // 22:30 UTC on the 15th is 00:30 on Wed 16 Sep in Brussels (week of 14 Sep)
  item({
    id: "C",
    createdAt: t("2026-09-15T22:30:00Z"),
    startedAt: t("2026-09-17T08:00:00Z"),
    stateGroup: "STARTED",
    stateId: "s-started",
    priority: "HIGH",
  }),
  // created in August (outside), completed Tue 29 Sep (week of 28 Sep); cycle 35 d, lead 40 d
  item({
    id: "D",
    createdAt: t("2026-08-20T10:00:00Z"),
    startedAt: t("2026-08-25T10:00:00Z"),
    completedAt: t("2026-09-29T10:00:00Z"),
    stateGroup: "COMPLETED",
    stateId: "s-done",
    assigneeIds: ["u2"],
  }),
  // 22:30 UTC on 30 Sep is already 1 Oct in Brussels: outside the window
  item({ id: "E", createdAt: t("2026-09-30T22:30:00Z") }),
];

const WEEKS = ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];

describe("analytics aggregation", () => {
  it("interpolates percentiles like PERCENTILE_CONT", () => {
    expect(percentile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(percentile([2, 10, 35], 0.85)).toBeCloseTo(27.5);
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.85)).toBe(7);
  });

  it("covers the window with calendar buckets", () => {
    expect(bucketsBetween(ctx.from, ctx.to, "week", 1)).toEqual(WEEKS);
    expect(bucketsBetween("2026-08-15", "2026-10-02", "month", 1)).toEqual([
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
    expect(bucketsBetween("2026-09-29", "2026-10-01", "day", 1)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
    expect(previousWindow(ctx)).toMatchObject({ from: "2026-08-02", to: "2026-08-31" });
  });

  it("counts created items per week in the workspace time zone", () => {
    const d = aggregate({ metric: "created", xAxis: "week", segment: null }, { items }, ctx);
    expect(d.x).toEqual(WEEKS);
    expect(WEEKS.map((w) => d.values[w]?.value)).toEqual([1, 1, 1, 0, 0]);
    expect(d.total).toBe(3); // A, B, C (E is 1 October locally)
  });

  it("counts completed items and the created-vs-completed flow", () => {
    const done = aggregate({ metric: "completed", xAxis: "week", segment: null }, { items }, ctx);
    expect(WEEKS.map((w) => done.values[w]?.value)).toEqual([1, 0, 1, 0, 1]);
    expect(done.total).toBe(3);

    const flow = aggregate({ metric: "flow", xAxis: "week", segment: null }, { items }, ctx);
    expect(flow.series).toEqual(["created", "completed"]);
    expect(WEEKS.map((w) => [flow.values[w]?.created, flow.values[w]?.completed])).toEqual([
      [1, 1],
      [1, 0],
      [1, 1],
      [0, 0],
      [0, 1],
    ]);
  });

  it("reports cycle and lead time as p50 and p85 in days", () => {
    const cycle = aggregate({ metric: "cycle_time", xAxis: "none", segment: null }, { items }, ctx);
    // [2, 10, 35] → p50 10, p85 10 + 25 × 0.7 = 27.5
    expect(cycle.values.all).toEqual({ p50: 10, p85: 27.5 });
    expect(cycle.total).toBe(10);
    expect(cycle.unit).toBe("days");

    const lead = aggregate({ metric: "lead_time", xAxis: "none", segment: null }, { items }, ctx);
    // [3, 10, 40] → p50 10, p85 10 + 30 × 0.7 = 31
    expect(lead.values.all).toEqual({ p50: 10, p85: 31 });

    const weekly = aggregate(
      { metric: "cycle_time", xAxis: "week", segment: null },
      { items },
      ctx,
    );
    expect(weekly.values["2026-09-07"]).toEqual({ p50: null, p85: null });
    expect(weekly.values["2026-09-28"]).toEqual({ p50: 35, p85: 35 });
  });

  it("counts a multi-assignee item once per assignee but once in the total", () => {
    const d = aggregate({ metric: "created", xAxis: "assignee", segment: null }, { items }, ctx);
    expect(d.x).toEqual(["u1", "u2", "none"]);
    expect(d.x.map((x) => d.values[x]?.value)).toEqual([2, 1, 1]);
    expect(d.total).toBe(3);
  });

  it("segments by priority in the priority order", () => {
    const d = aggregate({ metric: "created", xAxis: "week", segment: "priority" }, { items }, ctx);
    expect(d.series).toEqual(["HIGH", "LOW"]);
    expect(d.values["2026-08-31"]).toEqual({ HIGH: 1, LOW: 0 });
    expect(d.values["2026-09-07"]).toEqual({ HIGH: 0, LOW: 1 });
    expect(d.values["2026-09-14"]).toEqual({ HIGH: 1, LOW: 0 });
  });

  it("counts open items by state group, ignoring the window", () => {
    const open = items.filter((i) => ["BACKLOG", "UNSTARTED", "STARTED"].includes(i.stateGroup));
    const d = aggregate(
      { metric: "open_items", xAxis: "stateGroup", segment: null },
      { items: open },
      ctx,
    );
    expect(d.x).toEqual(["BACKLOG", "STARTED"]);
    expect(d.values.BACKLOG?.value).toBe(1);
    expect(d.values.STARTED?.value).toBe(1);
    expect(d.total).toBe(2);
  });

  it("measures intake volume and time to triage", () => {
    const intake: IntakeRow[] = [
      {
        id: "I1",
        projectId: "p1",
        status: "ACCEPTED",
        source: "FORM",
        createdAt: t("2026-09-10T08:00:00Z"),
        triagedAt: t("2026-09-10T20:00:00Z"), // 0.5 d
      },
      {
        id: "I2",
        projectId: "p1",
        status: "DECLINED",
        source: "IN_APP",
        createdAt: t("2026-09-11T08:00:00Z"),
        triagedAt: t("2026-09-14T08:00:00Z"), // 3 d
      },
      {
        id: "I3",
        projectId: "p2",
        status: "PENDING",
        source: "FORM",
        createdAt: t("2026-09-20T08:00:00Z"),
        triagedAt: null,
      },
    ];
    const vol = aggregate(
      { metric: "intake_volume", xAxis: "intakeStatus", segment: null },
      { intake },
      ctx,
    );
    expect(vol.x).toEqual(["PENDING", "ACCEPTED", "DECLINED"]);
    expect(vol.total).toBe(3);
    const ttt = aggregate(
      { metric: "time_to_triage", xAxis: "none", segment: null },
      { intake },
      ctx,
    );
    // [0.5, 3] → p50 1.75, shown to one decimal
    expect(ttt.total).toBe(1.8);
    expect(ttt.values.all?.p85).toBeCloseTo(2.6); // 0.5 + 2.5 × 0.85 = 2.625
  });

  it("sums the last snapshot per bucket and project", () => {
    const d = aggregateSnapshots(
      { xAxis: "week", segment: "stateGroup" },
      [
        {
          projectId: "p1",
          date: "2026-09-28",
          byStateGroup: { BACKLOG: 2, STARTED: 1 },
          byPriority: {},
          openCount: 3,
        },
        {
          projectId: "p1",
          date: "2026-09-29",
          byStateGroup: { BACKLOG: 1, STARTED: 2 },
          byPriority: {},
          openCount: 3,
        },
        {
          projectId: "p2",
          date: "2026-09-29",
          byStateGroup: { UNSTARTED: 4 },
          byPriority: {},
          openCount: 4,
        },
      ],
      ctx,
    );
    expect(d.values["2026-09-28"]).toEqual({ BACKLOG: 1, UNSTARTED: 4, STARTED: 2 });
    expect(d.values["2026-09-21"]).toEqual({ BACKLOG: null, UNSTARTED: null, STARTED: null });
    expect(d.total).toBe(7);
  });

  it("folds categories past the limit into Other and reports empty charts", () => {
    const sizes = new Map(Array.from({ length: 10 }, (_, i) => [`k${i}`, 10 - i]));
    const { keys, fold } = orderKeys(sizes, "assignee", 8);
    expect(keys).toEqual(["k0", "k1", "k2", "k3", "k4", "k5", "k6", "other"]);
    expect(fold("k9")).toBe("other");
    expect(
      isEmptyChart(aggregate({ metric: "created", xAxis: "week", segment: null }, {}, ctx)),
    ).toBe(true);
  });
});

describe("built-in dashboards", () => {
  it("only use metric × axis × chart combinations the registry allows", async () => {
    const { WidgetSpecSchema } = await import("../schemas/analytics");
    const { PROJECT_DASHBOARD, WORKSPACE_DASHBOARD } = await import("./dashboards");
    for (const widget of [...WORKSPACE_DASHBOARD, ...PROJECT_DASHBOARD]) {
      const parsed = WidgetSpecSchema.safeParse(widget.spec);
      expect(parsed.success, `${widget.key}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });
});
