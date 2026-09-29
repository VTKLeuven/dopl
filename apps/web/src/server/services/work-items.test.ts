import { describe, expect, it } from "vitest";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import {
  createWorkItem,
  createWorkItems,
  moveWorkItem,
  setDeleted,
  updateWorkItem,
} from "./work-items";

async function setup() {
  const ws = await makeWorkspace();
  const admin = await makeMember(ws, "ADMIN", "Ann Admin");
  const project = await makeProject(admin);
  return { ws, admin, project };
}

describe("work items service", () => {
  it("numbers items per project and writes activity + realtime rows", async () => {
    const { admin, project } = await setup();
    const a = await createWorkItem(admin, { projectId: project.id, title: "First" });
    const b = await createWorkItem(admin, { projectId: project.id, title: "Second" });
    expect(b.sequence).toBe((a.sequence ?? 0) + 1);
    const item = await db.workItem.findUniqueOrThrow({ where: { id: a.id } });
    expect(item.stateGroup).toBe("BACKLOG"); // project default state
    expect(await db.activity.count({ where: { workItemId: a.id, verb: "created" } })).toBe(1);
    expect(
      await db.realtimeEvent.count({
        where: { topic: `project:${project.id}`, type: "workItem.created" },
      }),
    ).toBe(2);
    expect(
      await db.workItemSubscriber.count({
        where: { workItemId: a.id, userId: admin.actor.userId },
      }),
    ).toBe(1);
  });

  it("pastes lines as items in line order", async () => {
    const { admin, project } = await setup();
    const created = await createWorkItems(admin, {
      projectId: project.id,
      titles: ["one", "two", "three"],
    });
    expect(created.map((c) => c.title)).toEqual(["one", "two", "three"]);
    const seqs = created.map((c) => c.sequence ?? 0);
    expect(seqs[1]).toBe((seqs[0] ?? 0) + 1);
    const ordered = await db.workItem.findMany({
      where: { projectId: project.id },
      orderBy: { sortKey: "asc" },
      select: { title: true },
    });
    expect(ordered.map((o) => o.title)).toEqual(["one", "two", "three"]);
  });

  it("keeps stateGroup, completedAt and parent counters consistent", async () => {
    const { admin, project } = await setup();
    const parent = await createWorkItem(admin, { projectId: project.id, title: "Parent" });
    const child = await createWorkItem(admin, {
      projectId: project.id,
      title: "Child",
      parentId: parent.id,
    });
    let p = await db.workItem.findUniqueOrThrow({ where: { id: parent.id } });
    expect([p.childCount, p.childDoneCount]).toEqual([1, 0]);

    await updateWorkItem(admin, { id: child.id, stateId: project.byName("Done").id });
    const c = await db.workItem.findUniqueOrThrow({ where: { id: child.id } });
    expect(c.stateGroup).toBe("COMPLETED");
    expect(c.completedAt).not.toBeNull();
    p = await db.workItem.findUniqueOrThrow({ where: { id: parent.id } });
    expect(p.childDoneCount).toBe(1);

    await updateWorkItem(admin, { id: child.id, stateId: project.byName("In progress").id });
    const reopened = await db.workItem.findUniqueOrThrow({ where: { id: child.id } });
    expect(reopened.completedAt).toBeNull();
    expect(reopened.startedAt).not.toBeNull();
    p = await db.workItem.findUniqueOrThrow({ where: { id: parent.id } });
    expect(p.childDoneCount).toBe(0);

    await setDeleted(admin, child.id, true);
    p = await db.workItem.findUniqueOrThrow({ where: { id: parent.id } });
    expect(p.childCount).toBe(0);
  });

  it("rejects parent cycles and start after due", async () => {
    const { admin, project } = await setup();
    const a = await createWorkItem(admin, { projectId: project.id, title: "A" });
    const b = await createWorkItem(admin, { projectId: project.id, title: "B", parentId: a.id });
    await expect(updateWorkItem(admin, { id: a.id, parentId: b.id })).rejects.toThrow(
      "parent_cycle",
    );
    await expect(
      updateWorkItem(admin, { id: a.id, startDate: "2026-10-10", dueDate: "2026-10-01" }),
    ).rejects.toThrow("start_after_due");
  });

  it("records per-field activity with state names", async () => {
    const { admin, project } = await setup();
    const a = await createWorkItem(admin, { projectId: project.id, title: "A" });
    await updateWorkItem(admin, {
      id: a.id,
      priority: "HIGH",
      stateId: project.byName("Todo").id,
      title: "A2",
    });
    const rows = await db.activity.findMany({
      where: { workItemId: a.id, verb: "updated" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((r) => r.field).sort()).toEqual(["priority", "state", "title"]);
    const state = rows.find((r) => r.field === "state");
    expect(state?.meta).toMatchObject({ fromName: "Backlog", toName: "Todo" });
  });

  it("moves an item between neighbours", async () => {
    const { admin, project } = await setup();
    const [x, y, z] = await createWorkItems(admin, {
      projectId: project.id,
      titles: ["x", "y", "z"],
    });
    await moveWorkItem(admin, { id: z!.id, beforeId: x!.id, afterId: y!.id });
    const ordered = await db.workItem.findMany({
      where: { projectId: project.id },
      orderBy: { sortKey: "asc" },
      select: { title: true },
    });
    expect(ordered.map((o) => o.title)).toEqual(["x", "z", "y"]);
  });

  it("members can create; guests outside the project see nothing (404, not 403)", async () => {
    const { ws, project } = await setup();
    const member = await makeMember(ws, "MEMBER");
    const created = await createWorkItem(member, { projectId: project.id, title: "member ok" });
    expect(created.sequence).toBeGreaterThan(0);
    const guest = await makeMember(ws, "GUEST");
    await expect(
      createWorkItem(guest, { projectId: project.id, title: "nope" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
