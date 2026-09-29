import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keysBetween } from "@dopl/shared/sort-keys";
import { uuidv7 } from "@dopl/shared/ids";
import type { FilterGroup } from "@dopl/shared/schemas/filters";
import { db } from "../db";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import type { WorkspaceCtx } from "../session";
import { listItems, listProjectItems, WORKSPACE_ITEMS_LIMIT } from "./work-items";
import { projectAccessById } from "./projects";

/**
 * Phase 2 performance pass (ROADMAP §2.10): 50,000 items across 10 projects,
 * every view query timed. Target: 50 ms for filtered views and lists up to
 * 2,000 rows; bigger unfiltered lists cost roughly 12 µs per row (transfer and
 * parsing, not planning), so they get a linear budget (D-062). p50 is asserted;
 * p95 is reported, because GC pauses on a shared dev machine make it noisy.
 */
const PROJECTS = 10;
const PER_PROJECT = 5_000;
const RUNS = 25;
const P95_BUDGET_MS = 50;
const budgetFor = (rows: number) => (rows <= 2_000 ? P95_BUDGET_MS : 15 + rows * 0.015);

let ctx: WorkspaceCtx;
let members: string[] = [];
const projects: Array<{ id: string; identifier: string }> = [];
const labelIds: string[] = [];
const results: Array<{ name: string; rows: number; p50: number; p95: number; budget: number }> = [];
const plans: string[] = [];

const pick = <T>(xs: T[], i: number) => xs[i % xs.length] as T;
const day = (offset: number) => new Date(Date.UTC(2026, 8, 1) + offset * 86_400_000);

beforeAll(async () => {
  const ws = await makeWorkspace();
  ctx = await makeMember(ws, "ADMIN", "Perf Admin");
  members = [ctx.actor.userId];
  for (let i = 0; i < 7; i++) members.push((await makeMember(ws, "MEMBER", `M${i}`)).actor.userId);
  const t0 = Date.now();
  for (let p = 0; p < PROJECTS; p++) {
    const project = await makeProject(ctx);
    projects.push({ id: project.id, identifier: project.identifier });
    const states = project.states.filter((s) => s.group !== "TRIAGE");
    const labels = await db.label.findMany({
      where: { projectId: project.id },
      select: { id: true },
    });
    labelIds.push(...labels.map((l) => l.id));
    const keys = keysBetween(null, null, PER_PROJECT);
    const items = Array.from({ length: PER_PROJECT }, (_, i) => {
      const state = pick(states, i * 7 + p);
      return {
        id: uuidv7(),
        workspaceId: ws.id,
        projectId: project.id,
        sequence: i + 1,
        title: `${pick(["Replace", "Upgrade", "Audit", "Fix", "Document", "Migrate"], i)} ${pick(["VPN", "switch", "backup", "DNS", "printer", "firewall", "wiki"], i * 3)} ${i}`,
        stateId: state.id,
        stateGroup: state.group,
        priority: pick(["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as const, i),
        sortKey: keys[i] as string,
        startDate: i % 3 === 0 ? day(i % 60) : null,
        dueDate: i % 2 === 0 ? day((i % 90) + 5) : null,
        completedAt: state.group === "COMPLETED" ? day(i % 30) : null,
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
    await db.workItemLabel.createMany({
      data: items
        .filter((_, i) => i % 3 !== 0)
        .map((it, i) => ({ workItemId: it.id, labelId: pick(labels, i).id, workspaceId: ws.id })),
    });
    await db.workItemRelation.createMany({
      data: items.slice(0, 200).map((it, i) => ({
        workspaceId: ws.id,
        sourceId: it.id,
        targetId: (items[i + 200] ?? it).id,
        type: "BLOCKS" as const,
      })),
    });
    await db.project.update({ where: { id: project.id }, data: { nextSequence: PER_PROJECT + 1 } });
  }
  await db.$executeRawUnsafe("ANALYZE");
  console.log(
    `seeded ${PROJECTS * PER_PROJECT} items in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
});

afterAll(() => {
  console.table(results);
  console.log(plans.join("\n"));
});

async function time(name: string, fn: () => Promise<{ rows: unknown[] }>) {
  for (let i = 0; i < 3; i++) await fn(); // warm caches and the pool
  const ms: number[] = [];
  let rows = 0;
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    rows = (await fn()).rows.length;
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  const q = (p: number) =>
    Number((ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] ?? 0).toFixed(1));
  const budget = Math.round(budgetFor(rows));
  results.push({ name, rows, p50: q(0.5), p95: q(0.95), budget });
  return q(0.5) - budget;
}

const rule = (field: string, operator: string, value?: unknown): FilterGroup => ({
  op: "and",
  items: [{ field, operator, value } as FilterGroup["items"][number]],
});
const none: FilterGroup = { op: "and", items: [] };

describe("view queries at 50k items", () => {
  it("project views stay under budget", async () => {
    const project = projects[0] as { id: string; identifier: string };
    const access = await projectAccessById(ctx, project.id);
    const run =
      (filters: FilterGroup, completed: "hide" | "show" = "hide") =>
      () =>
        listProjectItems(ctx, access, { completed, filters });
    const budgets = [
      await time("project, done hidden", run(none)),
      await time("project, everything", run(none, "show")),
      await time("project, assignee = me", run(rule("assignee", "in", ["me"]))),
      await time("project, label in", run(rule("label", "in", [labelIds[0]]))),
      await time("project, priority in", run(rule("priority", "in", ["URGENT", "HIGH"]))),
      await time("project, overdue", run(rule("dueDate", "before", "today"))),
      await time("project, title contains", run(rule("title", "contains", "firewall"))),
      await time("project, blocked", run(rule("isBlocked", "is", true))),
    ];
    for (const over of budgets) expect(over).toBeLessThan(0);
  });

  it("workspace views stay under budget", async () => {
    const run = (filters: FilterGroup) => () =>
      listItems(ctx, projects, { completed: "hide", filters }, { limit: WORKSPACE_ITEMS_LIMIT });
    const budgets = [
      await time("workspace, assignee = me", run(rule("assignee", "in", ["me"]))),
      await time(
        "workspace, overdue + urgent",
        run({
          op: "and",
          items: [
            { field: "dueDate", operator: "before", value: "today" },
            { field: "priority", operator: "in", value: ["URGENT"] },
          ],
        }),
      ),
      await time("workspace, everything (capped)", run(none)),
    ];
    for (const over of budgets) expect(over).toBeLessThan(0);
  });

  it("explains the main access paths", async () => {
    const pid = (projects[0] as { id: string }).id;
    const queries: Record<string, string> = {
      "open items of a project": `SELECT id FROM work_items WHERE "projectId" = '${pid}' AND "deletedAt" IS NULL AND "archivedAt" IS NULL AND "stateGroup" IN ('BACKLOG','UNSTARTED','STARTED') ORDER BY "sortKey"`,
      "assigned to a user": `SELECT "workItemId" FROM work_item_assignees WHERE "userId" = '${members[0]}'`,
      "title search": `SELECT id FROM work_items WHERE "workspaceId" = '${ctx.workspace.id}' AND title ILIKE '%firewall%'`,
      "overdue in a project": `SELECT id FROM work_items WHERE "projectId" = '${pid}' AND "dueDate" < '2026-09-30'`,
    };
    for (const [name, sql] of Object.entries(queries)) {
      const rows = await db.$queryRawUnsafe<Array<{ "QUERY PLAN": string }>>(
        `EXPLAIN ANALYZE ${sql}`,
      );
      plans.push(`── ${name}\n${rows.map((r) => r["QUERY PLAN"]).join("\n")}`);
    }
  });
});
