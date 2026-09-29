import { beforeAll, describe, expect, it } from "vitest";
import type { FilterGroup, FilterRule } from "@dopl/shared/schemas/filters";
import { FILTER_FIELDS, operatorsFor } from "@dopl/shared/schemas/filters";
import { db } from "../db";
import { addRelation, createWorkItem } from "../services/work-items";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import { compileFilter, startOfDayIn } from "./filters";

/**
 * One fixture project, then every field × operator the builder offers.
 * "Now" is Wednesday 2026-09-30 10:00 UTC; the workspace is in Europe/Brussels
 * (UTC+2 in September) with weeks starting on Monday.
 */
const NOW = new Date("2026-09-30T10:00:00.000Z");

let ids: Record<string, string>;
let meId: string;
let otherId: string;
let projectId: string;
let states: Record<string, string>;
let labels: Record<string, string>;
let bugTypeId: string;

beforeAll(async () => {
  const ws = await makeWorkspace();
  const me = await makeMember(ws, "ADMIN", "Me");
  const other = await makeMember(ws, "MEMBER", "Other");
  meId = me.actor.userId;
  otherId = other.actor.userId;
  const project = await makeProject(me);
  projectId = project.id;
  states = Object.fromEntries(project.states.map((s) => [s.name, s.id]));
  labels = Object.fromEntries(
    (await db.label.findMany({ where: { workspaceId: ws.id } })).map((l) => [l.name, l.id]),
  );
  bugTypeId = (
    await db.workItemType.create({
      data: { workspaceId: ws.id, name: "Bug", icon: "bug", color: "red", sortKey: "b0" },
    })
  ).id;

  const make = (title: string, extra: Record<string, unknown>) =>
    createWorkItem(me, { projectId, title, ...extra });
  const a = await make("Fix VPN tunnel", {
    stateId: states.Todo,
    priority: "HIGH",
    assigneeIds: [meId],
    labelIds: [labels.hardware],
    startDate: "2026-09-20",
    dueDate: "2026-09-29",
    estimate: 3,
    typeId: bugTypeId,
  });
  const b = await make("Order new switch", {
    stateId: states["In progress"],
    priority: "LOW",
    assigneeIds: [otherId],
    labelIds: [labels.hardware, labels.network],
    dueDate: "2026-10-02",
  });
  const c = await make("Write docs", { stateId: states.Backlog, estimate: 8 });
  const d = await make("VPN subtask", {
    stateId: states.Todo,
    priority: "URGENT",
    parentId: a.id,
    dueDate: "2026-10-15",
  });
  const e = await make("Old closed thing", { stateId: states.Done });
  const f = await make("Blocker", { stateId: states.Todo });
  ids = { a: a.id, b: b.id, c: c.id, d: d.id, e: e.id, f: f.id };

  await addRelation(me, { id: f.id, type: "BLOCKS", targetId: c.id }); // open → C is blocked
  await addRelation(me, { id: e.id, type: "BLOCKS", targetId: b.id }); // done → B is not

  const setTs = (id: string, createdAt: string, extra: Record<string, unknown> = {}) =>
    db.$executeRawUnsafe(
      `UPDATE work_items SET "createdAt" = $1::timestamptz${
        extra.completedAt ? `, "completedAt" = '${String(extra.completedAt)}'::timestamptz` : ""
      } WHERE id = $2::uuid`,
      createdAt,
      id,
    );
  await setTs(a.id, "2026-09-01T12:00:00Z");
  // 23:30 in Brussels on the 29th: still "yesterday" locally.
  await setTs(b.id, "2026-09-29T21:30:00Z");
  // 00:30 in Brussels on the 30th: already "today" locally.
  await setTs(c.id, "2026-09-29T22:30:00Z");
  await setTs(d.id, "2026-09-30T08:00:00Z");
  await setTs(e.id, "2026-08-01T08:00:00Z", { completedAt: "2026-09-25T10:00:00Z" });
  await setTs(f.id, "2026-09-10T08:00:00Z");
});

async function run(filter: FilterGroup | FilterRule): Promise<string[]> {
  const group: FilterGroup = "items" in filter ? filter : { op: "and", items: [filter] };
  const where = compileFilter(group, {
    userId: meId,
    timeZone: "Europe/Brussels",
    weekStartsOn: 1,
    now: NOW,
  });
  const rows = await db.workItem.findMany({
    where: { AND: [{ projectId, deletedAt: null }, where] },
    select: { id: true },
  });
  const byId = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
  return rows.map((r) => byId[r.id] ?? "?").sort();
}

const rule = (field: FilterRule["field"], operator: FilterRule["operator"], value?: unknown) =>
  ({ field, operator, value }) as FilterRule;

describe("filter compiler", () => {
  it("empty filter matches everything", async () => {
    expect(await run({ op: "and", items: [] })).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(await run({ op: "or", items: [] })).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("state, stateGroup and priority", async () => {
    expect(await run(rule("state", "in", [states.Todo]))).toEqual(["a", "d", "f"]);
    expect(await run(rule("state", "notIn", [states.Todo, states.Done]))).toEqual(["b", "c"]);
    expect(await run(rule("stateGroup", "in", ["STARTED", "COMPLETED"]))).toEqual(["b", "e"]);
    expect(await run(rule("stateGroup", "notIn", ["UNSTARTED"]))).toEqual(["b", "c", "e"]);
    expect(await run(rule("priority", "in", ["URGENT", "HIGH"]))).toEqual(["a", "d"]);
    expect(await run(rule("priority", "notIn", ["NONE"]))).toEqual(["a", "b", "d"]);
  });

  it("type and parent: 'none of' keeps empty values", async () => {
    expect(await run(rule("type", "in", [bugTypeId]))).toEqual(["a"]);
    expect(await run(rule("type", "notIn", [bugTypeId]))).toEqual(["b", "c", "d", "e", "f"]);
    expect(await run(rule("type", "isNotEmpty"))).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(await run(rule("type", "isEmpty"))).toEqual([]);
    expect(await run(rule("parent", "in", [ids.a]))).toEqual(["d"]);
    expect(await run(rule("parent", "notIn", [ids.a]))).toEqual(["a", "b", "c", "e", "f"]);
    expect(await run(rule("parent", "isEmpty"))).toEqual(["a", "b", "c", "e", "f"]);
    expect(await run(rule("parent", "isNotEmpty"))).toEqual(["d"]);
  });

  it("project, origin and createdBy (with 'me')", async () => {
    expect(await run(rule("project", "in", [projectId]))).toHaveLength(6);
    expect(await run(rule("project", "notIn", [projectId]))).toEqual([]);
    expect(await run(rule("origin", "in", ["APP"]))).toHaveLength(6);
    expect(await run(rule("origin", "notIn", ["APP"]))).toEqual([]);
    expect(await run(rule("createdBy", "in", ["me"]))).toHaveLength(6);
    expect(await run(rule("createdBy", "in", [otherId]))).toEqual([]);
    expect(await run(rule("createdBy", "notIn", ["me"]))).toEqual([]);
    expect(await run(rule("createdBy", "isEmpty"))).toEqual([]);
    expect(await run(rule("createdBy", "isNotEmpty"))).toHaveLength(6);
  });

  it("assignee, subscriber and label (many-valued)", async () => {
    expect(await run(rule("assignee", "in", ["me"]))).toEqual(["a"]);
    expect(await run(rule("assignee", "in", ["me", otherId]))).toEqual(["a", "b"]);
    expect(await run(rule("assignee", "notIn", ["me"]))).toEqual(["b", "c", "d", "e", "f"]);
    expect(await run(rule("assignee", "isEmpty"))).toEqual(["c", "d", "e", "f"]);
    expect(await run(rule("assignee", "isNotEmpty"))).toEqual(["a", "b"]);
    expect(await run(rule("subscriber", "in", [otherId]))).toEqual(["b"]);
    expect(await run(rule("subscriber", "notIn", [otherId]))).toEqual(["a", "c", "d", "e", "f"]);
    expect(await run(rule("subscriber", "isEmpty"))).toEqual([]);
    expect(await run(rule("subscriber", "isNotEmpty"))).toHaveLength(6);
    expect(await run(rule("label", "in", [labels.network]))).toEqual(["b"]);
    expect(await run(rule("label", "in", [labels.hardware]))).toEqual(["a", "b"]);
    expect(await run(rule("label", "notIn", [labels.hardware]))).toEqual(["c", "d", "e", "f"]);
    expect(await run(rule("label", "isEmpty"))).toEqual(["c", "d", "e", "f"]);
    expect(await run(rule("label", "isNotEmpty"))).toEqual(["a", "b"]);
  });

  it("calendar dates with dynamic tokens", async () => {
    // today = 2026-09-30 (Wed); week = 28 Sep – 4 Oct
    expect(await run(rule("dueDate", "before", "today"))).toEqual(["a"]);
    expect(await run(rule("dueDate", "after", "today"))).toEqual(["b", "d"]);
    expect(await run(rule("dueDate", "is", "yesterday"))).toEqual(["a"]);
    expect(await run(rule("dueDate", "is", "2026-10-02"))).toEqual(["b"]);
    expect(await run(rule("dueDate", "between", ["startOfWeek", "endOfWeek"]))).toEqual(["a", "b"]);
    // reversed bounds are swapped: 28 Sep – 30 Sep
    expect(await run(rule("dueDate", "between", ["endOfMonth", "startOfWeek"]))).toEqual(["a"]);
    expect(await run(rule("dueDate", "withinNext", { amount: 2, unit: "week" }))).toEqual(["b"]);
    expect(await run(rule("dueDate", "withinNext", { amount: 3, unit: "week" }))).toEqual([
      "b",
      "d",
    ]);
    expect(await run(rule("dueDate", "withinLast", { amount: 1, unit: "day" }))).toEqual(["a"]);
    expect(await run(rule("dueDate", "isEmpty"))).toEqual(["c", "e", "f"]);
    expect(await run(rule("dueDate", "isNotEmpty"))).toEqual(["a", "b", "d"]);
    expect(await run(rule("startDate", "before", "startOfWeek"))).toEqual(["a"]);
    expect(await run(rule("startDate", "after", "today"))).toEqual([]);
    expect(await run(rule("startDate", "withinLast", { amount: 1, unit: "month" }))).toEqual(["a"]);
    expect(await run(rule("startDate", "isEmpty"))).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("timestamps use local days in the workspace time zone", async () => {
    expect(await run(rule("createdAt", "is", "today"))).toEqual(["c", "d"]);
    expect(await run(rule("createdAt", "is", "yesterday"))).toEqual(["b"]);
    expect(await run(rule("createdAt", "before", "2026-09-10"))).toEqual(["a", "e"]);
    expect(await run(rule("createdAt", "after", "2026-09-29"))).toEqual(["c", "d"]);
    expect(await run(rule("createdAt", "between", ["2026-09-10", "yesterday"]))).toEqual([
      "b",
      "f",
    ]);
    expect(await run(rule("createdAt", "withinLast", { amount: 1, unit: "week" }))).toEqual([
      "b",
      "c",
      "d",
    ]);
    expect(await run(rule("createdAt", "withinNext", { amount: 1, unit: "day" }))).toEqual([
      "c",
      "d",
    ]);
    expect(await run(rule("completedAt", "withinLast", { amount: 7, unit: "day" }))).toEqual(["e"]);
    expect(await run(rule("completedAt", "isEmpty"))).toEqual(["a", "b", "c", "d", "f"]);
    expect(await run(rule("completedAt", "isNotEmpty"))).toEqual(["e"]);
    // updatedAt is the real clock for every fixture, so only use fixed dates here.
    expect(await run(rule("updatedAt", "before", "2026-09-01"))).toEqual([]);
    expect(await run(rule("updatedAt", "after", "2026-09-01"))).toHaveLength(6);
  });

  it("estimate, title and booleans", async () => {
    expect(await run(rule("estimate", "is", 3))).toEqual(["a"]);
    expect(await run(rule("estimate", "lt", 5))).toEqual(["a"]);
    expect(await run(rule("estimate", "gt", 5))).toEqual(["c"]);
    expect(await run(rule("estimate", "isEmpty"))).toEqual(["b", "d", "e", "f"]);
    expect(await run(rule("estimate", "isNotEmpty"))).toEqual(["a", "c"]);
    expect(await run(rule("title", "contains", "vpn"))).toEqual(["a", "d"]);
    expect(await run(rule("title", "contains", "  SWITCH "))).toEqual(["b"]);
    expect(await run(rule("hasSubItems", "is", true))).toEqual(["a"]);
    expect(await run(rule("hasSubItems", "is", false))).toEqual(["b", "c", "d", "e", "f"]);
    expect(await run(rule("isBlocked", "is", true))).toEqual(["c"]);
    expect(await run(rule("isBlocked", "is", false))).toEqual(["a", "b", "d", "e", "f"]);
  });

  it("nested AND/OR groups", async () => {
    // (priority HIGH or URGENT) AND (assignee me OR has no due date)
    expect(
      await run({
        op: "and",
        items: [
          rule("priority", "in", ["HIGH", "URGENT"]),
          {
            op: "or",
            items: [rule("assignee", "in", ["me"]), rule("dueDate", "isEmpty")],
          },
        ],
      }),
    ).toEqual(["a"]);
    expect(
      await run({
        op: "or",
        items: [rule("label", "in", [labels.network]), rule("isBlocked", "is", true)],
      }),
    ).toEqual(["b", "c"]);
    // An empty nested group is ignored rather than matching nothing.
    expect(
      await run({ op: "and", items: [rule("priority", "in", ["LOW"]), { op: "or", items: [] }] }),
    ).toEqual(["b"]);
  });

  it("covers every field × operator the builder offers", () => {
    // Guard: if a field or operator is added, this test must be extended.
    const pairs = Object.keys(FILTER_FIELDS).flatMap((f) =>
      operatorsFor(f as FilterRule["field"]).map((o) => `${f}.${o}`),
    );
    expect(pairs).toHaveLength(78);
  });

  it("finds the start of a local day across DST", () => {
    expect(startOfDayIn("2026-09-30", "Europe/Brussels").toISOString()).toBe(
      "2026-09-29T22:00:00.000Z",
    );
    expect(startOfDayIn("2026-12-01", "Europe/Brussels").toISOString()).toBe(
      "2026-11-30T23:00:00.000Z",
    );
  });
});
