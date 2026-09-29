import { describe, expect, it } from "vitest";
import { NotificationType } from "@dopl/db";
import { INBOX_FILTERS, NOTIFICATION_TYPES } from "@dopl/shared/schemas/inbox";
import { db } from "../db";
import { inboxCounts, listNotifications, getNotificationPreferences } from "../queries/inbox";
import { createProject } from "./projects";
import { addToProject, makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import { createComment } from "./comments";
import {
  markAllRead,
  setNotificationPreference,
  snoozeNotifications,
  updateNotifications,
} from "./inbox";
import { createWorkItem, updateWorkItem } from "./work-items";

const doc = (text: string, mentions: Array<{ id: string; label: string }> = []) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text },
        ...mentions.map((m) => ({ type: "mention", attrs: { id: m.id, label: m.label } })),
      ],
    },
  ],
});
const all = { view: "all" as const, filter: null, cursor: null };
const unread = { view: "unread" as const, filter: null, cursor: null };

async function setup() {
  const ws = await makeWorkspace();
  const ann = await makeMember(ws, "ADMIN", "Ann Admin");
  const bram = await makeMember(ws, "MEMBER", "Bram Member");
  const chloe = await makeMember(ws, "MEMBER", "Chloé Member");
  const project = await makeProject(ann);
  return { ws, ann, bram, chloe, project };
}

describe("notification types", () => {
  it("the shared list mirrors the database enum", () => {
    expect([...NOTIFICATION_TYPES].sort()).toEqual(Object.values(NotificationType).sort());
  });
  it("every type sits in exactly one inbox filter", () => {
    const seen = Object.values(INBOX_FILTERS).flat();
    expect([...seen].sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });
});

describe("inbox fan-out", () => {
  it("state changes reach subscribers, grouped into one row per item", async () => {
    const { ann, bram, project } = await setup();
    const item = await createWorkItem(ann, {
      projectId: project.id,
      title: "Rotate TLS certificates",
      assigneeIds: [bram.actor.userId],
    });
    // Ann is the creator (subscribed), Bram the assignee (subscribed).
    await updateWorkItem(bram, { id: item.id, stateId: project.byName("In progress").id });
    await updateWorkItem(bram, { id: item.id, stateId: project.byName("Done").id });

    const annInbox = await listNotifications(ann, all);
    const updates = annInbox.rows.filter((r) => r.type === "WORK_ITEM_UPDATED");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.data).toMatchObject({ to: "Done", count: 2, identifier: item.identifier });
    expect(updates[0]?.actor?.name).toBe("Bram Member");
    expect(updates[0]?.href).toBe(`/${ann.workspace.slug}/i/${item.identifier}`);
    // The actor never notifies themselves.
    const bramInbox = await listNotifications(bram, all);
    expect(bramInbox.rows.filter((r) => r.type === "WORK_ITEM_UPDATED")).toHaveLength(0);
    // …and Bram got the assignment.
    expect(bramInbox.rows.map((r) => r.type)).toContain("ASSIGNED");
  });

  it("a read row stops collecting; the next change starts a new one", async () => {
    const { ann, bram, project } = await setup();
    const item = await createWorkItem(ann, { projectId: project.id, title: "Grouping" });
    await updateWorkItem(bram, { id: item.id, stateId: project.byName("In progress").id });
    const first = (await listNotifications(ann, unread)).rows[0];
    expect(first).toBeDefined();
    await updateNotifications(ann, { ids: [first?.id], action: "read" });
    await updateWorkItem(bram, { id: item.id, stateId: project.byName("Done").id });
    const rows = (await listNotifications(ann, all)).rows.filter(
      (r) => r.type === "WORK_ITEM_UPDATED",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.readAt).toBeNull();
    expect(rows[1]?.readAt).not.toBeNull();
  });

  it("mentions in comments reach the mentioned person; muting the type in-app stops them", async () => {
    const { ann, bram, chloe, project } = await setup();
    const item = await createWorkItem(ann, { projectId: project.id, title: "Mentions" });
    await createComment(ann, {
      workItemId: item.id,
      body: doc("can you look? ", [{ id: bram.actor.userId, label: "Bram" }]),
    });
    expect((await listNotifications(bram, unread)).rows[0]).toMatchObject({
      type: "MENTION",
      identifier: item.identifier,
    });

    await setNotificationPreference(chloe, { type: "MENTION", inApp: false });
    await createComment(ann, {
      workItemId: item.id,
      body: doc("and you ", [{ id: chloe.actor.userId, label: "Chloé" }]),
    });
    expect((await listNotifications(chloe, all)).rows).toHaveLength(0);
    const prefs = await getNotificationPreferences(chloe);
    expect(prefs.MENTION).toEqual({ inApp: false, email: false });
    expect(prefs.ASSIGNED).toEqual({ inApp: true, email: false });
    // Toggling again updates the same row.
    await setNotificationPreference(chloe, { type: "MENTION", email: true });
    const rows = await db.notificationPreference.findMany({
      where: { userId: chloe.actor.userId, type: "MENTION" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ inApp: false, email: true });
  });
});

describe("inbox state", () => {
  async function withThree() {
    const s = await setup();
    for (const title of ["One", "Two", "Three"])
      await createWorkItem(s.ann, {
        projectId: s.project.id,
        title,
        assigneeIds: [s.bram.actor.userId],
      });
    const rows = (await listNotifications(s.bram, all)).rows;
    expect(rows).toHaveLength(3);
    return { ...s, rows };
  }

  it("read, unread, archive and counts", async () => {
    const { bram, rows } = await withThree();
    expect((await inboxCounts(bram)).unread).toBe(3);
    expect((await inboxCounts(bram)).byFilter.assigned).toBe(3);
    await updateNotifications(bram, { ids: [rows[0]?.id], action: "read" });
    expect((await inboxCounts(bram)).unread).toBe(2);
    expect((await listNotifications(bram, unread)).rows).toHaveLength(2);
    await updateNotifications(bram, { ids: [rows[0]?.id], action: "unread" });
    expect((await inboxCounts(bram)).unread).toBe(3);
    await updateNotifications(bram, { ids: [rows[1]?.id, rows[2]?.id], action: "archive" });
    expect((await listNotifications(bram, all)).rows).toHaveLength(1);
    expect(
      (await listNotifications(bram, { view: "archived", filter: null, cursor: null })).rows,
    ).toHaveLength(2);
    expect((await inboxCounts(bram)).unread).toBe(1);
    await markAllRead(bram, {});
    expect((await inboxCounts(bram)).unread).toBe(0);
  });

  it("snoozed rows leave the inbox until their time comes", async () => {
    const { bram, rows } = await withThree();
    const until = new Date(Date.now() + 60 * 60_000).toISOString();
    await snoozeNotifications(bram, { ids: [rows[0]?.id], until });
    expect((await listNotifications(bram, all)).rows).toHaveLength(2);
    expect((await inboxCounts(bram)).unread).toBe(2);
    expect(
      (await listNotifications(bram, { view: "snoozed", filter: null, cursor: null })).rows,
    ).toHaveLength(1);
    // Waking it early brings it back.
    await snoozeNotifications(bram, { ids: [rows[0]?.id], until: null });
    expect((await listNotifications(bram, all)).rows).toHaveLength(3);
    await expect(
      snoozeNotifications(bram, { ids: [rows[0]?.id], until: new Date(0).toISOString() }),
    ).rejects.toThrow();
  });

  it("nobody can touch someone else's notifications", async () => {
    const { ann, bram, rows } = await withThree();
    const res = await updateNotifications(ann, { ids: rows.map((r) => r.id), action: "archive" });
    expect(res.updated).toBe(0);
    expect((await inboxCounts(bram)).unread).toBe(3);
  });

  it("filters by type and pages with a cursor", async () => {
    const { bram, rows } = await withThree();
    const mentions = await listNotifications(bram, {
      view: "all",
      filter: "mentions",
      cursor: null,
    });
    expect(mentions.rows).toHaveLength(0);
    const last = rows[1];
    const next = await listNotifications(bram, {
      view: "all",
      filter: null,
      cursor: `${last?.createdAt}|${last?.id}`,
    });
    expect(next.rows.map((r) => r.id)).toEqual([rows[2]?.id]);
  });

  it("hides notifications about projects the reader can no longer see", async () => {
    const { ws, ann } = await setup();
    const dries = await makeMember(ws, "MEMBER", "Dries");
    const secret = await createProject(ann, {
      name: "Secret",
      identifier: `S${Date.now().toString(36).slice(-5).toUpperCase()}`,
      visibility: "PRIVATE",
    });
    await addToProject(secret.id, dries, "MEMBER");
    await createWorkItem(ann, {
      projectId: secret.id,
      title: "Hush",
      assigneeIds: [dries.actor.userId],
    });
    expect((await inboxCounts(dries)).unread).toBe(1);
    await db.projectMember.deleteMany({
      where: { projectId: secret.id, userId: dries.actor.userId },
    });
    expect((await inboxCounts(dries)).unread).toBe(0);
    expect((await listNotifications(dries, all)).rows).toHaveLength(0);
  });
});
