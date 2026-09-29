import { describe, expect, it } from "vitest";
import { WORKSPACE_DASHBOARD } from "@dopl/shared/domain/dashboards";
import { ForbiddenError } from "@dopl/shared/policy";
import { EMPTY_FILTER } from "@dopl/shared/schemas/filters";
import type { WidgetSpec } from "@dopl/shared/schemas/analytics";
import { db } from "../db";
import { createProject } from "../services/projects";
import { createWorkItem } from "../services/work-items";
import {
  createDashboard,
  deleteWidget,
  moveWidget,
  saveWidget,
  updateDashboard,
} from "../services/dashboards";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import { runMetric } from "./analytics";
import { getDashboard, listDashboards } from "./dashboards";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const spec = (s: Partial<WidgetSpec> & Pick<WidgetSpec, "metric">): WidgetSpec => ({
  xAxis: "none",
  segment: null,
  chartType: "NUMBER",
  filters: EMPTY_FILTER,
  ...s,
});

/**
 * A public project with two items and a private one with one, dated relative
 * to now. Hand-computed: A was started 2 days ago and completed 1 day ago
 * (cycle 1 d, lead 2 d); B is in progress and HIGH; C is private.
 */
async function setup() {
  const ws = await makeWorkspace();
  const admin = await makeMember(ws, "ADMIN", "Ann Admin");
  const member = await makeMember(ws, "MEMBER", "Mia Member");
  const guest = await makeMember(ws, "GUEST", "Gus Guest");
  const project = await makeProject(admin);
  const secret = await createProject(admin, {
    name: "Secret",
    identifier: `S${Date.now().toString(36).slice(-5).toUpperCase()}`,
    visibility: "PRIVATE",
  });
  const done = project.states.find((s) => s.group === "COMPLETED")!;
  const started = project.states.find((s) => s.group === "STARTED")!;

  const a = await createWorkItem(admin, { projectId: project.id, title: "A" });
  await db.workItem.update({
    where: { id: a.id },
    data: {
      createdAt: ago(3),
      startedAt: ago(2),
      completedAt: ago(1),
      stateId: done.id,
      stateGroup: "COMPLETED",
    },
  });
  const b = await createWorkItem(admin, { projectId: project.id, title: "B", priority: "HIGH" });
  await db.workItem.update({
    where: { id: b.id },
    data: { createdAt: ago(10), startedAt: ago(5), stateId: started.id, stateGroup: "STARTED" },
  });
  const c = await createWorkItem(admin, { projectId: secret.id, title: "C" });
  await db.workItem.update({ where: { id: c.id }, data: { createdAt: ago(2) } });
  return { admin, member, guest, project, secret };
}

describe("analytics metrics", () => {
  it("counts only what the reader can see", async () => {
    const { admin, member } = await setup();
    const created = { spec: spec({ metric: "created" }), range: "30d" };
    expect((await runMetric(member, created)).total).toBe(2); // A, B
    expect((await runMetric(admin, created)).total).toBe(3); // + C in the private project
  });

  it("measures completion, cycle and lead time on real rows", async () => {
    const { member } = await setup();
    const q = (metric: WidgetSpec["metric"]) => ({ spec: spec({ metric }), range: "30d" });
    expect((await runMetric(member, q("completed"))).total).toBe(1);
    expect((await runMetric(member, q("cycle_time"))).total).toBe(1);
    expect((await runMetric(member, q("lead_time"))).total).toBe(2);
    const open = await runMetric(member, q("open_items"));
    expect(open.total).toBe(1); // B
    expect(open.previous).toBeNull(); // no history for "now" metrics
  });

  it("applies the chart's filter and the project scope", async () => {
    const { member, project, secret } = await setup();
    const byPriority = (value: string[]) => ({
      spec: spec({
        metric: "created",
        filters: { op: "and", items: [{ field: "priority", operator: "in", value }] },
      }),
      range: "30d",
    });
    expect((await runMetric(member, byPriority(["HIGH"]))).total).toBe(1);
    expect((await runMetric(member, byPriority(["LOW"]))).total).toBe(0);
    const scoped = (projectId: string) => ({
      spec: spec({ metric: "created" }),
      range: "30d",
      projectId,
    });
    expect((await runMetric(member, scoped(project.id))).total).toBe(2);
    // A project the reader can't browse yields nothing, not an error that confirms it exists.
    expect((await runMetric(member, scoped(secret.id))).total).toBe(0);
  });

  it("labels entity keys and keeps guests out", async () => {
    const { member, guest, project } = await setup();
    const res = await runMetric(member, {
      spec: spec({ metric: "created", xAxis: "project", chartType: "BAR" }),
      range: "30d",
    });
    expect(res.x).toEqual([project.id]);
    expect(res.labels[project.id]?.label).toBe(project.name);
    await expect(runMetric(guest, { spec: spec({ metric: "created" }) })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects combinations the registry doesn't allow", async () => {
    const { member } = await setup();
    await expect(
      runMetric(member, { spec: spec({ metric: "flow", xAxis: "priority", chartType: "LINE" }) }),
    ).rejects.toThrow();
  });
});

describe("dashboards", () => {
  it("duplicates the built-in dashboard, with its widgets in order", async () => {
    const { member } = await setup();
    const { id } = await createDashboard(member, {
      name: "Mine",
      fromDefault: "workspace",
      titles: { open: "Open items" },
    });
    const d = await getDashboard(member, id);
    expect(d.widgets.map((w) => w.spec.metric)).toEqual(
      WORKSPACE_DASHBOARD.map((w) => w.spec.metric),
    );
    expect(d.widgets[0]?.title).toBe("Open items");
    expect(d.canEdit).toBe(true);
  });

  it("keeps private dashboards private and shared ones read-only", async () => {
    const { member, admin } = await setup();
    const { id } = await createDashboard(member, { name: "Team health" });
    await expect(getDashboard(admin, id)).rejects.toThrow();
    expect(await listDashboards(admin)).toHaveLength(0);

    await updateDashboard(member, { id, visibility: "WORKSPACE" });
    const seen = await getDashboard(admin, id);
    expect(seen.canEdit).toBe(false);
    expect(seen.canDelete).toBe(true); // admins may clean up shared dashboards
    await expect(
      saveWidget(admin, {
        dashboardId: id,
        title: "Nope",
        spec: spec({ metric: "created" }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("adds, reorders and removes widgets", async () => {
    const { member } = await setup();
    const { id } = await createDashboard(member, { name: "Layout" });
    const first = await saveWidget(member, {
      dashboardId: id,
      title: "First",
      spec: spec({ metric: "created" }),
    });
    const second = await saveWidget(member, {
      dashboardId: id,
      title: "Second",
      spec: spec({ metric: "completed" }),
      w: 12,
    });
    let d = await getDashboard(member, id);
    expect(d.widgets.map((w) => w.title)).toEqual(["First", "Second"]);
    expect(d.widgets[1]?.w).toBe(12);

    // Move "Second" in front of "First".
    await moveWidget(member, { id: second.id, before: null, after: d.widgets[0]!.key });
    d = await getDashboard(member, id);
    expect(d.widgets.map((w) => w.title)).toEqual(["Second", "First"]);

    await deleteWidget(member, first.id);
    d = await getDashboard(member, id);
    expect(d.widgets.map((w) => w.title)).toEqual(["Second"]);
  });
});
