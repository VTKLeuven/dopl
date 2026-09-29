import { beforeAll, describe, expect, it } from "vitest";
import { keysBetween } from "@dopl/shared/sort-keys";
import { uuidv7 } from "@dopl/shared/ids";
import { EMPTY_FILTER } from "@dopl/shared/schemas/filters";
import { METRIC_DEFS, type MetricQuery } from "@dopl/shared/schemas/analytics";
import { db } from "../db";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import type { WorkspaceCtx } from "../session";
import { runMetric } from "./analytics";

/**
 * Analytics at 50,000 items (D-100): 10 projects × 5,000 items created over
 * the last year, a third of them completed. `PERF_FILE=… pnpm perf` prints
 * p50/p95 per chart; p50 is asserted against a budget that includes loading
 * the rows, since metrics aggregate in TypeScript.
 */
const PROJECTS = 10;
const PER_PROJECT = Number(process.env.PERF_PER_PROJECT ?? 5_000);
const RUNS = 7;
const DAY = 86_400_000;
const pick = <T>(xs: T[], i: number) => xs[i % xs.length] as T;

let ctx: WorkspaceCtx;
const results: Array<{ name: string; p50: number; p95: number; budget: number }> = [];

beforeAll(async () => {
  const ws = await makeWorkspace();
  ctx = await makeMember(ws, "ADMIN", "Perf Admin");
  const members = [ctx.actor.userId];
  for (let i = 0; i < 7; i++) members.push((await makeMember(ws, "MEMBER", `M${i}`)).actor.userId);
  const now = Date.now();
  for (let p = 0; p < PROJECTS; p++) {
    const project = await makeProject(ctx);
    const states = project.states.filter((s) => s.group !== "TRIAGE");
    const keys = keysBetween(null, null, PER_PROJECT);
    const items = Array.from({ length: PER_PROJECT }, (_, i) => {
      const state = pick(states, i * 7 + p);
      const created = now - ((i * 37) % 365) * DAY;
      const done = state.group === "COMPLETED";
      return {
        id: uuidv7(),
        workspaceId: ws.id,
        projectId: project.id,
        sequence: i + 1,
        title: `Item ${i}`,
        stateId: state.id,
        stateGroup: state.group,
        priority: pick(["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as const, i),
        sortKey: keys[i] as string,
        createdAt: new Date(created),
        startedAt: done || state.group === "STARTED" ? new Date(created + 2 * DAY) : null,
        completedAt: done ? new Date(Math.min(now, created + ((i % 20) + 3) * DAY)) : null,
        dueDate: i % 2 === 0 ? new Date(created + 14 * DAY) : null,
        createdById: ctx.actor.userId,
      };
    });
    for (let c = 0; c < items.length; c += 2_500)
      await db.workItem.createMany({ data: items.slice(c, c + 2_500) });
    await db.workItemAssignee.createMany({
      data: items
        .filter((_, i) => i % 4 !== 0)
        .map((it, i) => ({ workItemId: it.id, userId: pick(members, i), workspaceId: ws.id })),
    });
  }
  await db.$executeRawUnsafe("ANALYZE work_items; ANALYZE work_item_assignees;");
}, 600_000);

const q = (
  spec: Partial<MetricQuery["spec"]> & Pick<MetricQuery["spec"], "metric">,
  range = "90d",
) => ({
  spec: {
    xAxis: "none",
    segment: null,
    chartType: METRIC_DEFS[spec.metric].defaultChart,
    filters: EMPTY_FILTER,
    ...spec,
  },
  range,
});

async function time(name: string, query: unknown, budget: number) {
  await runMetric(ctx, query); // warm
  const ms: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await runMetric(ctx, query);
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  const p50 = ms[Math.floor(ms.length / 2)] ?? 0;
  const p95 = ms[ms.length - 1] ?? 0;
  results.push({ name, p50: Math.round(p50), p95: Math.round(p95), budget });
  return p50;
}

describe("analytics at 50k items", () => {
  it("keeps each chart within budget", async () => {
    const cases: Array<[string, unknown, number]> = [
      ["open items by project", q({ metric: "open_items", xAxis: "project" }), 500],
      ["open by assignee", q({ metric: "open_items", xAxis: "assignee" }), 750],
      ["created per week, 90 d", q({ metric: "created", xAxis: "week" }), 600],
      ["created vs completed, 12 months", q({ metric: "flow", xAxis: "week" }, "365d"), 1_500],
      ["cycle time per week, 90 d", q({ metric: "cycle_time", xAxis: "week" }), 300],
      ["overdue", q({ metric: "overdue" }), 300],
      [
        "open over time",
        q({ metric: "open_over_time", xAxis: "week", segment: "stateGroup" }),
        150,
      ],
    ];
    for (const [name, query, budget] of cases) await time(name, query, budget);
    console.table(results);
    for (const r of results) expect(r.p50, r.name).toBeLessThan(r.budget);
  });
});
