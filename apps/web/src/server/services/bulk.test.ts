import { describe, expect, it } from "vitest";
import { db } from "../db";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import {
  createWorkItem,
  moveToProject,
  patchManyWorkItems,
  setArchivedMany,
  setDeletedMany,
} from "./work-items";

async function setup() {
  const ws = await makeWorkspace();
  const admin = await makeMember(ws, "ADMIN", "Ann Admin");
  const from = await makeProject(admin);
  const to = await makeProject(admin);
  return { admin, from, to };
}

describe("bulk work item operations", () => {
  it("patches items with different values in one activity batch", async () => {
    const { admin, from } = await setup();
    const a = await createWorkItem(admin, { projectId: from.id, title: "A", priority: "LOW" });
    const b = await createWorkItem(admin, { projectId: from.id, title: "B", priority: "HIGH" });
    await patchManyWorkItems(admin, {
      items: [
        { id: a.id, patch: { priority: "URGENT" } },
        { id: b.id, patch: { priority: "NONE" } },
      ],
    });
    const rows = await db.workItem.findMany({
      where: { id: { in: [a.id, b.id] } },
      select: { id: true, priority: true },
    });
    expect(Object.fromEntries(rows.map((r) => [r.id, r.priority]))).toEqual({
      [a.id]: "URGENT",
      [b.id]: "NONE",
    });
    const batches = await db.activity.findMany({
      where: { workItemId: { in: [a.id, b.id] }, field: "priority" },
      select: { batchId: true },
    });
    expect(new Set(batches.map((x) => x.batchId)).size).toBe(1);
  });

  it("archives and deletes many at once, and restores them", async () => {
    const { admin, from } = await setup();
    const ids = [
      (await createWorkItem(admin, { projectId: from.id, title: "one" })).id,
      (await createWorkItem(admin, { projectId: from.id, title: "two" })).id,
    ];
    await setArchivedMany(admin, ids, true);
    expect(await db.workItem.count({ where: { id: { in: ids }, archivedAt: { not: null } } })).toBe(
      2,
    );
    await setArchivedMany(admin, ids, false);
    await setDeletedMany(admin, ids, true);
    expect(await db.workItem.count({ where: { id: { in: ids }, deletedAt: { not: null } } })).toBe(
      2,
    );
    await setDeletedMany(admin, ids, false);
    expect(await db.workItem.count({ where: { id: { in: ids }, deletedAt: null } })).toBe(2);
  });

  it("moves items to another project: new numbers, mapped state and labels, cut parent links", async () => {
    const { admin, from, to } = await setup();
    const labels = await db.label.findMany({ where: { projectId: from.id } });
    const hardware = labels.find((l) => l.name === "hardware");
    const parent = await createWorkItem(admin, { projectId: from.id, title: "Parent" });
    const child = await createWorkItem(admin, {
      projectId: from.id,
      title: "Child",
      parentId: parent.id,
      stateId: from.byName("In progress").id,
      labelIds: hardware ? [hardware.id] : [],
    });
    const other = await createWorkItem(admin, { projectId: to.id, title: "Existing" });

    const { moved } = await moveToProject(admin, { ids: [child.id], projectId: to.id });
    expect(moved).toHaveLength(1);

    const after = await db.workItem.findUniqueOrThrow({
      where: { id: child.id },
      include: { state: true, labels: { include: { label: true } } },
    });
    expect(after.projectId).toBe(to.id);
    expect(after.sequence).toBe((other.sequence ?? 0) + 1);
    expect(after.state.projectId).toBe(to.id);
    expect(after.state.group).toBe("STARTED");
    expect(after.parentId).toBeNull();
    expect(after.labels.map((l) => [l.label.name, l.label.projectId])).toEqual(
      hardware ? [["hardware", to.id]] : [],
    );
    const oldParent = await db.workItem.findUniqueOrThrow({ where: { id: parent.id } });
    expect(oldParent.childCount).toBe(0);
    expect(
      await db.activity.count({ where: { workItemId: child.id, verb: "moved", field: "project" } }),
    ).toBe(1);
  });

  it("moving a parent cuts children that stay behind", async () => {
    const { admin, from, to } = await setup();
    const parent = await createWorkItem(admin, { projectId: from.id, title: "Parent" });
    const kid = await createWorkItem(admin, {
      projectId: from.id,
      title: "Kid",
      parentId: parent.id,
    });
    await moveToProject(admin, { ids: [parent.id], projectId: to.id });
    expect((await db.workItem.findUniqueOrThrow({ where: { id: kid.id } })).parentId).toBeNull();
    expect((await db.workItem.findUniqueOrThrow({ where: { id: parent.id } })).childCount).toBe(0);
  });
});
