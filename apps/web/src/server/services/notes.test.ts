import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@dopl/shared/policy";
import { docToPlainText, type PMNode } from "@dopl/shared/rich-text";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import {
  getNote,
  getNotesSummary,
  getReview,
  listNotes,
  listTags,
  listTodos,
} from "../queries/notes";
import { getWorkItemDetail } from "../queries/work-items";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import {
  convertNote,
  convertTodo,
  createNote,
  deleteTag,
  purgeNote,
  renameTag,
  reviewNote,
  setNoteDeleted,
  setTodoDue,
  toggleTodo,
  updateNote,
} from "./notes";

const text = (t: string): PMNode => ({ type: "text", text: t });
const p = (t: string): PMNode => ({ type: "paragraph", content: t ? [text(t)] : [] });
const task = (label: string, checked = false, blockId?: string): PMNode => ({
  type: "taskItem",
  attrs: { checked, ...(blockId ? { blockId } : {}) },
  content: [p(label)],
});
const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content });
const list = (...items: PMNode[]): PMNode => ({ type: "taskList", content: items });

const query = { filter: "all" as const, limit: 300 };

async function setup() {
  const ws = await makeWorkspace();
  const owner = await makeMember(ws, "MEMBER", "Bram Member");
  const other = await makeMember(ws, "MEMBER", "Chloe Member");
  const admin = await makeMember(ws, "ADMIN", "Ann Admin");
  const guest = await makeMember(ws, "GUEST", "Gus Guest");
  const project = await makeProject(admin);
  return { ws, owner, other, admin, guest, project };
}

const blockIds = (content: unknown) => {
  const ids: string[] = [];
  const walk = (n: PMNode) => {
    if (n.type === "taskItem") ids.push(String(n.attrs?.blockId));
    n.content?.forEach(walk);
  };
  walk(content as PMNode);
  return ids;
};

describe("notes service", () => {
  it("creates a note with parsed tags, projected to-dos and a review date", async () => {
    const { owner } = await setup();
    const card = await createNote(owner, {
      content: doc(
        p("Proxmox plan #infra/proxmox #Meeting"),
        list(task("Back up"), task("Upgrade", true)),
      ),
    });
    expect(card.tags).toEqual(["infra/proxmox", "meeting"]);
    expect(card.todoCount).toBe(2);
    expect(card.openTodoCount).toBe(1);
    expect(card.canEdit).toBe(true);
    const tags = await listTags(owner);
    // The parent exists implicitly; only written tags are linked.
    expect(tags.map((t) => [t.path, t.count])).toEqual([
      ["infra", 0],
      ["infra/proxmox", 1],
      ["meeting", 1],
    ]);
    expect(tags.find((t) => t.path === "infra/proxmox")?.parentId).toBe(
      tags.find((t) => t.path === "infra")?.id,
    );
    const note = await db.note.findUniqueOrThrow({ where: { id: card.id } });
    expect(note.nextReviewAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    expect(blockIds(note.content)).toHaveLength(2);
    expect(await db.activity.count({ where: { entityId: card.id, verb: "created" } })).toBe(1);
    expect(
      await db.realtimeEvent.count({
        where: { topic: `user:${owner.actor.userId}`, type: "note.created" },
      }),
    ).toBe(1);
  });

  it("keeps block ids, due dates and links stable across edits (D-022)", async () => {
    const { owner } = await setup();
    const card = await createNote(owner, { content: doc(list(task("One"), task("Two"))) });
    const content = (await db.note.findUniqueOrThrow({ where: { id: card.id } })).content;
    const [a, b] = blockIds(content);
    const todoB = await db.noteTodo.findFirstOrThrow({ where: { noteId: card.id, blockId: b } });
    await setTodoDue(owner, { todoId: todoB.id, dueDate: "2026-10-01" });
    // Edit: drop "One", rename "Two", check it, add "Three".
    await updateNote(owner, {
      id: card.id,
      content: doc(list(task("Two!", true, b), task("Three"))),
    });
    const todos = await db.noteTodo.findMany({
      where: { noteId: card.id },
      orderBy: { position: "asc" },
    });
    expect(todos.map((t) => [t.blockId === b, t.text, t.checked])).toEqual([
      [true, "Two!", true],
      [false, "Three", false],
    ]);
    expect(todos[0]?.id).toBe(todoB.id);
    expect(todos[0]?.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(todos.some((t) => t.blockId === a)).toBe(false);
    const note = await db.note.findUniqueOrThrow({ where: { id: card.id } });
    expect(note.openTodoCount).toBe(1);
  });

  it("toggling from My to-dos rewrites that one node and the projection together", async () => {
    const { owner } = await setup();
    const card = await createNote(owner, { content: doc(p("List"), list(task("A"), task("B"))) });
    const open = await listTodos(owner, "open");
    const b = open.find((t) => t.text === "B")!;
    const next = await toggleTodo(owner, { noteId: card.id, blockId: b.blockId, checked: true });
    expect(next.openTodoCount).toBe(1);
    const items = ((next.content as PMNode).content?.[1]?.content ?? []) as PMNode[];
    expect(items.map((i) => [i.attrs?.blockId === b.blockId, i.attrs?.checked])).toEqual([
      [false, false],
      [true, true],
    ]);
    const row = await db.noteTodo.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.checked).toBe(true);
    expect(row.checkedAt).not.toBeNull();
    expect((await listTodos(owner, "open")).map((t) => t.text)).toEqual(["A"]);
    expect((await listTodos(owner, "done")).map((t) => t.text)).toEqual(["B"]);
  });

  it("converts a checkbox line into a work item with a link back", async () => {
    const { admin, project } = await setup();
    const card = await createNote(admin, { content: doc(list(task("Replace the UPS battery"))) });
    const [todo] = await listTodos(admin, "open");
    const res = await convertTodo(admin, {
      noteId: card.id,
      blockId: todo!.blockId,
      projectId: project.id,
    });
    expect(res.item.identifier).toMatch(new RegExp(`^${project.identifier}-\\d+$`));
    const item = await db.workItem.findUniqueOrThrow({ where: { id: res.item.id } });
    expect(item.title).toBe("Replace the UPS battery");
    const ref = await db.workItemReference.findFirstOrThrow({ where: { workItemId: item.id } });
    expect(ref).toMatchObject({
      kind: "CREATED_FROM",
      sourceType: "NOTE_TODO",
      noteId: card.id,
      noteTodoId: todo!.id,
    });
    expect((await db.noteTodo.findUniqueOrThrow({ where: { id: todo!.id } })).workItemId).toBe(
      item.id,
    );
    // Struck through, with the #INFRA-n chip.
    const line = (res.note.content as PMNode).content?.[0]?.content?.[0]?.content?.[0];
    expect(line?.content?.[0]?.marks).toEqual([{ type: "strike" }]);
    expect(line?.content?.at(-1)).toMatchObject({
      type: "workItemRef",
      attrs: { id: item.id, identifier: res.item.identifier },
    });
    expect(res.note.openTodoCount).toBe(0);
    expect((await listTodos(admin, "converted"))[0]?.workItem?.identifier).toBe(
      res.item.identifier,
    );
    await expect(
      convertTodo(admin, { noteId: card.id, blockId: todo!.blockId, projectId: project.id }),
    ).rejects.toThrow("already_converted");
  });

  it("puts the source note on the item's timeline, without a private note's text", async () => {
    const { admin, other, project } = await setup();
    const card = await createNote(admin, { content: doc(list(task("Renew the wildcard cert"))) });
    const [todo] = await listTodos(admin, "open");
    const res = await convertTodo(admin, {
      noteId: card.id,
      blockId: todo!.blockId,
      projectId: project.id,
    });
    const mine = await getWorkItemDetail(admin, res.item.identifier);
    expect(mine.references).toEqual([
      expect.objectContaining({
        source: "note",
        kind: "CREATED_FROM",
        note: expect.objectContaining({
          id: card.id,
          line: expect.stringContaining("Renew the wildcard cert"),
        }),
      }),
    ]);
    // A teammate sees the item but not the owner's private note.
    const theirs = await getWorkItemDetail(other, res.item.identifier);
    expect(theirs.references).toEqual([
      expect.objectContaining({
        source: "note",
        note: expect.objectContaining({ excerpt: null, line: null, ownerName: "Ann Admin" }),
      }),
    ]);
    await updateNote(admin, { id: card.id, sharing: { kind: "workspace" } });
    const shared = await getWorkItemDetail(other, res.item.identifier);
    expect(shared.references[0]).toMatchObject({
      note: { excerpt: expect.stringContaining("Renew the wildcard cert") },
    });
  });

  it("converts a whole note and shows it on the item", async () => {
    const { admin, project, other } = await setup();
    const card = await createNote(admin, {
      content: doc(p("Rotate the TLS certificates"), p("Details")),
    });
    const res = await convertNote(admin, { noteId: card.id, projectId: project.id });
    const item = await db.workItem.findUniqueOrThrow({ where: { id: res.item.id } });
    expect(item.title).toBe("Rotate the TLS certificates");
    expect(item.descriptionText).toContain("Details");
    expect(res.note.convertedTo?.identifier).toBe(res.item.identifier);
    // The owner sees the source note on the item; others don't (it's private).
    expect((await listNotes(admin, { ...query, item: item.id })).map((n) => n.id)).toEqual([
      card.id,
    ]);
    expect(await listNotes(other, { ...query, item: item.id })).toEqual([]);
  });

  it("enforces visibility: private, team, project and work item", async () => {
    const { owner, other, admin, guest, project } = await setup();
    const priv = await createNote(owner, { content: doc(p("private")) });
    const team = await createNote(owner, {
      content: doc(p("team")),
      sharing: { kind: "workspace" },
    });
    await db.project.update({ where: { id: project.id }, data: { visibility: "PRIVATE" } });
    await db.projectMember.create({
      data: {
        projectId: project.id,
        workspaceId: owner.workspace.id,
        userId: owner.actor.userId,
        role: "MEMBER",
        sortKey: "a0",
      },
    });
    const proj = await createNote(owner, {
      content: doc(p("project")),
      sharing: { kind: "project", projectId: project.id },
    });
    const shared = (ctx: typeof owner) =>
      listNotes(ctx, { ...query, filter: "shared" }).then((r) =>
        r.map((n) => n.contentText).sort(),
      );
    expect(await shared(other)).toEqual(["team"]); // not a member of the private project
    expect(await shared(admin)).toEqual(["project", "team"]); // admins see every project…
    await expect(getNote(admin, priv.id)).rejects.toBeInstanceOf(NotFoundError); // …not private notes
    expect(await shared(guest)).toEqual([]);
    await expect(getNote(guest, team.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getNote(other, team.id)).canEdit).toBe(false);
    await expect(getNote(other, proj.id)).rejects.toBeInstanceOf(NotFoundError);

    // Only the owner changes a note; others get 403 on what they can see, 404 otherwise.
    await expect(updateNote(other, { id: team.id, color: "red" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(updateNote(other, { id: priv.id, color: "red" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // Guests keep private notes but can't share them.
    const g = await createNote(guest, { content: doc(p("guest note")) });
    await expect(
      updateNote(guest, { id: g.id, sharing: { kind: "workspace" } }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Un-sharing reaches the old audience's topic.
    await updateNote(owner, { id: team.id, sharing: { kind: "private" } });
    expect(await shared(other)).toEqual([]);
    expect(
      await db.realtimeEvent.count({
        where: {
          topic: `workspace:${owner.workspace.id}`,
          type: "note.updated",
          payload: { equals: { id: team.id } },
        },
      }),
    ).toBe(1);
  });

  it("attaches notes to a work item for everyone who can see the item", async () => {
    const { owner, other, admin, project } = await setup();
    const created = await db.workItem.create({
      data: {
        workspaceId: admin.workspace.id,
        projectId: project.id,
        sequence: 999,
        title: "Item",
        stateId: project.byName("Backlog").id,
        stateGroup: "BACKLOG",
        sortKey: "a0",
      },
    });
    const card = await createNote(owner, {
      content: doc(p("attached")),
      sharing: { kind: "workItem", workItemId: created.id },
    });
    expect(card.workItem?.id).toBe(created.id);
    expect((await listNotes(other, { ...query, item: created.id })).map((n) => n.id)).toEqual([
      card.id,
    ]);
    expect(
      await db.realtimeEvent.count({
        where: { topic: `workItem:${created.id}`, type: "note.created" },
      }),
    ).toBe(1);
  });

  it("renames, merges and deletes tags in the notes' text", async () => {
    const { owner, other } = await setup();
    const a = await createNote(owner, { content: doc(p("A #infra/proxmox")) });
    const b = await createNote(owner, { content: doc(p("B #infra and #ops")) });
    const mine = await createNote(other, { content: doc(p("C #infra")) }); // other owner: untouched
    const infra = (await listTags(owner)).find((t) => t.path === "infra")!;

    const res = await renameTag(owner, { tagId: infra.id, path: "Hosts" });
    expect(res.count).toBe(2);
    const text = async (id: string) =>
      docToPlainText(
        (await db.note.findUniqueOrThrow({ where: { id } })).content as unknown as PMNode,
      );
    expect(await text(a.id)).toBe("A #hosts/proxmox");
    expect(await text(b.id)).toBe("B #hosts and #ops");
    expect(await text(mine.id)).toBe("C #infra");
    expect((await listTags(owner)).map((t) => t.path)).toEqual(["hosts", "hosts/proxmox", "ops"]);

    // Renaming onto an existing path merges.
    const ops = (await listTags(owner)).find((t) => t.path === "ops")!;
    await renameTag(owner, { tagId: ops.id, path: "hosts" });
    expect(await text(b.id)).toBe("B #hosts and #hosts");
    expect((await listTags(owner)).map((t) => t.path)).toEqual(["hosts", "hosts/proxmox"]);
    await expect(renameTag(owner, { tagId: ops.id, path: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    ); // merged away

    const hosts = (await listTags(owner)).find((t) => t.path === "hosts")!;
    await expect(renameTag(owner, { tagId: hosts.id, path: "hosts/sub" })).rejects.toThrow(
      "tag_into_itself",
    );
    await deleteTag(owner, { tagId: hosts.id });
    expect(await text(a.id)).toBe("A");
    expect(await listTags(owner)).toEqual([]);
    // Other people's tags are theirs: renaming someone else's tag is a 404.
    const theirs = (await listTags(other))[0]!;
    await expect(renameTag(owner, { tagId: theirs.id, path: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("filters by tag subtree and searches text", async () => {
    const { owner } = await setup();
    await createNote(owner, { content: doc(p("pve #infra/proxmox")) });
    await createNote(owner, { content: doc(p("switch #infra")) });
    await createNote(owner, { content: doc(p("lunch #food")) });
    const byTag = await listNotes(owner, { ...query, tag: "infra" });
    expect(byTag.map((n) => n.contentText).sort()).toEqual(["pve #infra/proxmox", "switch #infra"]);
    expect((await listNotes(owner, { ...query, tag: "infra/proxmox" })).length).toBe(1);
    expect((await listNotes(owner, { ...query, q: "LUNCH" })).map((n) => n.contentText)).toEqual([
      "lunch #food",
    ]);
  });

  it("trashes with undo and purges for good", async () => {
    const { owner } = await setup();
    const card = await createNote(owner, { content: doc(p("temp #scratch")) });
    await setNoteDeleted(owner, card.id, true);
    expect(await listNotes(owner, query)).toEqual([]);
    expect((await listNotes(owner, { ...query, filter: "trash" })).length).toBe(1);
    await setNoteDeleted(owner, card.id, false);
    expect((await listNotes(owner, query)).length).toBe(1);
    await expect(purgeNote(owner, card.id)).rejects.toThrow("not_in_trash");
    await setNoteDeleted(owner, card.id, true);
    await purgeNote(owner, card.id);
    expect(await db.note.count({ where: { id: card.id } })).toBe(0);
    expect(await listTags(owner)).toEqual([]);
  });

  it("serves a daily review set and spaces kept notes 1 → 3 → 7 → 21 → 60 days", async () => {
    const { owner } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 7; i++)
      ids.push((await createNote(owner, { content: doc(p(`n${i}`)) })).id);
    const past = new Date(Date.now() - 40 * 86_400_000);
    await db.note.updateMany({
      where: { id: { in: ids } },
      data: { nextReviewAt: past, createdAt: past },
    });
    await db.note.update({ where: { id: ids[0] }, data: { pinnedAt: new Date() } }); // pinned: never
    const first = await getReview(owner);
    expect(first.notes).toHaveLength(5);
    expect(first.notes.map((n) => n.id)).not.toContain(ids[0]);
    expect((await getNotesSummary(owner)).reviewLeft).toBe(5);

    const target = first.notes[0]!.id;
    const kept = await reviewNote(owner, { noteId: target, action: "keep" });
    const days = (iso: string | null) =>
      Math.round((new Date(iso!).getTime() - Date.now()) / 86_400_000);
    expect(days(kept.nextReviewAt)).toBe(3);
    for (const expected of [7, 21, 60, 60])
      expect(days((await reviewNote(owner, { noteId: target, action: "keep" })).nextReviewAt)).toBe(
        expected,
      );

    const second = await getReview(owner);
    expect(second.doneToday).toBe(1);
    expect(second.notes).toHaveLength(4);
    expect(second.notes.map((n) => n.id)).toEqual(first.notes.slice(1).map((n) => n.id));

    await reviewNote(owner, { noteId: second.notes[0]!.id, action: "snooze", days: 3 });
    await reviewNote(owner, { noteId: second.notes[1]!.id, action: "archive" });
    const third = await getReview(owner);
    expect(third.doneToday).toBe(3);
    expect(third.notes).toHaveLength(2);
  });
});
