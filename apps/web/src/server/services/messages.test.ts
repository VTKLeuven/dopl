import { describe, expect, it } from "vitest";
import { db } from "../db";
import {
  getChannelDetail,
  getThread,
  listBrowsableChannels,
  listChannelMessages,
  listSidebarChannels,
} from "../queries/channels";
import { listNotifications } from "../queries/inbox";
import { getWorkItemDetail } from "../queries/work-items";
import { TopicAccess } from "../realtime/access";
import { addToProject, makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import {
  addChannelMembers,
  createChannel,
  hideDm,
  joinChannel,
  leaveChannel,
  markChannelRead,
  openDm,
} from "./channels";
import {
  createItemFromMessage,
  editMessage,
  markThreadRead,
  sendMessage,
  setMessageDeleted,
  toggleMessageReaction,
} from "./messages";
import { createProject } from "./projects";
import { createWorkItem } from "./work-items";

type Node = Record<string, unknown>;
const text = (t: string): Node => ({ type: "text", text: t });
const mention = (id: string, label: string): Node => ({ type: "mention", attrs: { id, label } });
const ref = (id: string, label: string): Node => ({ type: "workItemRef", attrs: { id, label } });
const doc = (...parts: Array<string | Node>) => ({
  type: "doc",
  content: [
    { type: "paragraph", content: parts.map((p) => (typeof p === "string" ? text(p) : p)) },
  ],
});
const all = { view: "all" as const, filter: null, cursor: null };

async function setup() {
  const ws = await makeWorkspace();
  const ann = await makeMember(ws, "ADMIN", "Ann Admin");
  const bram = await makeMember(ws, "MEMBER", "Bram Member");
  const chloe = await makeMember(ws, "MEMBER", "Chloé Member");
  const guest = await makeMember(ws, "GUEST", "Gert Guest");
  const project = await makeProject(ann);
  const projectChannel = await db.channel.findUniqueOrThrow({
    where: { projectId: project.id },
    select: { id: true },
  });
  return { ws, ann, bram, chloe, guest, project, projectChannelId: projectChannel.id };
}

const msg = (topic: string, type = "message.created") => ({
  id: "1",
  workspaceId: "",
  topic,
  type,
  payload: {},
});

describe("channels and access", () => {
  it("project channels follow project access; guests see no chat at all", async () => {
    const { ann, bram, guest, project, projectChannelId } = await setup();
    await addToProject(project.id, guest, "GUEST");
    expect((await getChannelDetail(bram, projectChannelId)).can.post).toBe(true);
    await expect(getChannelDetail(guest, projectChannelId)).rejects.toThrow();
    await expect(
      sendMessage(guest, { channelId: projectChannelId, body: doc("hi") }),
    ).rejects.toThrow();
    expect((await listSidebarChannels(guest)).projects).toHaveLength(0);

    const secret = await createProject(ann, {
      name: "Secret",
      identifier: `S${Date.now().toString(36).slice(-5).toUpperCase()}`,
      visibility: "PRIVATE",
    });
    const secretChannel = await db.channel.findUniqueOrThrow({ where: { projectId: secret.id } });
    await expect(getChannelDetail(bram, secretChannel.id)).rejects.toThrow();
    const sidebar = await listSidebarChannels(bram);
    expect(sidebar.projects.map((c) => c.id)).toEqual([projectChannelId]);

    // The realtime fan-out applies the same rule.
    const bramTopics = new TopicAccess(bram);
    await bramTopics.refresh();
    expect(await bramTopics.allows(msg(`channel:${projectChannelId}`))).toBe(true);
    expect(await bramTopics.allows(msg(`channel:${secretChannel.id}`))).toBe(false);
    const guestTopics = new TopicAccess(guest);
    await guestTopics.refresh();
    expect(await guestTopics.allows(msg(`channel:${projectChannelId}`))).toBe(false);
  });

  it("private channels are for their members; public ones can be joined and left", async () => {
    const { ann, bram, chloe } = await setup();
    const priv = await createChannel(ann, {
      name: "Ops leads",
      isPrivate: true,
      memberIds: [bram.actor.userId],
    });
    expect(priv.slug).toBe("ops-leads");
    await sendMessage(bram, { channelId: priv.id, body: doc("members only") });
    await expect(listChannelMessages(chloe, priv.id)).rejects.toThrow();
    await expect(
      sendMessage(chloe, { channelId: priv.id, body: doc("let me in") }),
    ).rejects.toThrow();
    expect((await listBrowsableChannels(chloe)).map((c) => c.id)).not.toContain(priv.id);
    const chloeTopics = new TopicAccess(chloe);
    await chloeTopics.refresh();
    expect(await chloeTopics.allows(msg(`channel:${priv.id}`))).toBe(false);
    // Adding her opens it up (the access snapshot refreshes on membership events).
    await addChannelMembers(bram, { channelId: priv.id, userIds: [chloe.actor.userId] });
    expect(TopicAccess.affectsAccess(msg(`channel:${priv.id}`, "channel.membersChanged"))).toBe(
      true,
    );
    await chloeTopics.refresh();
    expect(await chloeTopics.allows(msg(`channel:${priv.id}`))).toBe(true);
    expect((await listChannelMessages(chloe, priv.id)).messages).toHaveLength(1);

    const pub = await createChannel(ann, { name: "General" });
    const browse = await listBrowsableChannels(chloe);
    expect(browse.find((c) => c.id === pub.id)).toMatchObject({ joined: false, memberCount: 1 });
    // Reading a public channel needs no membership; joining puts it in the sidebar.
    expect((await listChannelMessages(chloe, pub.id)).messages).toHaveLength(0);
    expect((await listSidebarChannels(chloe)).channels.map((c) => c.id)).not.toContain(pub.id);
    await joinChannel(chloe, pub.id);
    expect((await listSidebarChannels(chloe)).channels.map((c) => c.id)).toContain(pub.id);
    await leaveChannel(chloe, pub.id);
    expect((await listSidebarChannels(chloe)).channels.map((c) => c.id)).not.toContain(pub.id);
    // Posting in a public channel joins it.
    await sendMessage(chloe, { channelId: pub.id, body: doc("hello") });
    expect((await listSidebarChannels(chloe)).channels.map((c) => c.id)).toContain(pub.id);
    // Slugs stay unique per workspace.
    expect((await createChannel(bram, { name: "general" })).slug).toBe("general-2");
  });

  it("DMs are unique per set of people and reopen when someone writes", async () => {
    const { ann, bram, chloe } = await setup();
    const dm = await openDm(ann, { userIds: [bram.actor.userId] });
    expect(dm.created).toBe(true);
    expect((await openDm(bram, { userIds: [ann.actor.userId] })).id).toBe(dm.id);
    const group = await openDm(ann, { userIds: [bram.actor.userId, chloe.actor.userId] });
    expect(group.id).not.toBe(dm.id);
    await expect(getChannelDetail(chloe, dm.id)).rejects.toThrow();
    const detail = await getChannelDetail(ann, dm.id);
    expect(detail).toMatchObject({ kind: "DM", name: "Bram Member" });
    await expect(openDm(ann, { userIds: [ann.actor.userId] })).rejects.toThrow();

    await hideDm(bram, dm.id);
    expect((await listSidebarChannels(bram)).dms.map((c) => c.id)).not.toContain(dm.id);
    await sendMessage(ann, { channelId: dm.id, body: doc("ping") });
    const dms = (await listSidebarChannels(bram)).dms;
    expect(dms.find((c) => c.id === dm.id)).toMatchObject({ unread: 1, name: "Ann Admin" });
  });
});

describe("messages, unread and threads", () => {
  it("counts others' top-level messages after lastReadAt, across readers", async () => {
    const { ann, bram, projectChannelId } = await setup();
    const unread = async () =>
      (await listSidebarChannels(bram)).projects.find((c) => c.id === projectChannelId)?.unread;
    expect(await unread()).toBe(0);
    const first = await sendMessage(ann, { channelId: projectChannelId, body: doc("one") });
    await sendMessage(ann, { channelId: projectChannelId, body: doc("two") });
    expect(await unread()).toBe(2);
    // Thread replies don't count (they reach followers through the Inbox).
    await sendMessage(ann, {
      channelId: projectChannelId,
      threadRootId: first.id,
      body: doc("a reply"),
    });
    expect(await unread()).toBe(2);
    // Reading up to the first message leaves one.
    await markChannelRead(bram, { channelId: projectChannelId, at: first.createdAt });
    expect(await unread()).toBe(1);
    // Posting reads the channel up to your own message.
    await sendMessage(bram, { channelId: projectChannelId, body: doc("mine") });
    expect(await unread()).toBe(0);
    const three = await sendMessage(ann, { channelId: projectChannelId, body: doc("three") });
    expect(await unread()).toBe(1);
    // lastReadAt never moves back (another tab reporting an older position).
    await markChannelRead(bram, { channelId: projectChannelId, at: first.createdAt });
    expect(await unread()).toBe(1);
    await markChannelRead(bram, { channelId: projectChannelId, at: three.createdAt });
    expect(await unread()).toBe(0);
    // Ann read everything up to her last message; Bram's came before it.
    const annUnread = (await listSidebarChannels(ann)).projects.find(
      (c) => c.id === projectChannelId,
    )?.unread;
    expect(annUnread).toBe(0);
  });

  it("mentions notify people who can read the channel, and reading the channel reads them", async () => {
    const { ann, bram, chloe } = await setup();
    const priv = await createChannel(ann, {
      name: "Private",
      isPrivate: true,
      memberIds: [bram.actor.userId],
    });
    await sendMessage(ann, {
      channelId: priv.id,
      body: doc(
        "hey ",
        mention(bram.actor.userId, "Bram"),
        " and ",
        mention(chloe.actor.userId, "Chloé"),
      ),
    });
    const bramRows = (await listNotifications(bram, all)).rows;
    expect(bramRows).toHaveLength(1);
    expect(bramRows[0]).toMatchObject({ type: "MENTION", entityType: "MESSAGE" });
    expect(bramRows[0]?.href).toContain(`/messages/c/${priv.id}?msg=`);
    // Chloé isn't in the private channel: no notification, no leak.
    expect((await listNotifications(chloe, all)).rows).toHaveLength(0);
    const sidebar = await listSidebarChannels(bram);
    expect(sidebar.channels.find((c) => c.id === priv.id)?.mentions).toBe(1);
    await markChannelRead(bram, { channelId: priv.id });
    expect((await listNotifications(bram, all)).rows[0]?.readAt).not.toBeNull();
  });

  it("thread replies go to followers, grouped per thread", async () => {
    const { ann, bram, chloe, projectChannelId } = await setup();
    const root = await sendMessage(ann, {
      channelId: projectChannelId,
      body: doc("Deploy tonight?"),
    });
    await sendMessage(bram, {
      channelId: projectChannelId,
      threadRootId: root.id,
      body: doc("yes"),
    });
    await sendMessage(chloe, {
      channelId: projectChannelId,
      threadRootId: root.id,
      body: doc("I'll watch the dashboards"),
    });
    // Ann (root author) follows: one grouped row with both replies.
    const annRows = (await listNotifications(ann, all)).rows.filter(
      (r) => r.type === "THREAD_REPLY",
    );
    expect(annRows).toHaveLength(1);
    expect(annRows[0]?.data).toMatchObject({ count: 2, threadRootId: root.id });
    expect(annRows[0]?.actor?.name).toBe("Chloé Member");
    // Bram replied, so he follows and hears about Chloé's reply.
    expect((await listNotifications(bram, all)).rows.map((r) => r.type)).toEqual(["THREAD_REPLY"]);
    const thread = await getThread(ann, root.id);
    expect(thread.root.replyCount).toBe(2);
    expect(thread.replies.map((r) => r.author?.name)).toEqual(["Bram Member", "Chloé Member"]);
    expect(thread.following).toBe(true);
    await markThreadRead(ann, root.id);
    expect((await listNotifications(ann, { ...all, view: "unread" })).rows).toHaveLength(0);
    // Deleting a reply updates the count; the root keeps its place.
    await setMessageDeleted(chloe, thread.replies[1]?.id ?? "", true);
    expect((await getThread(ann, root.id)).root.replyCount).toBe(1);
    await expect(setMessageDeleted(chloe, root.id, true)).rejects.toThrow();
  });

  it("edits, reactions and #item chips", async () => {
    const { ann, bram, project, projectChannelId } = await setup();
    const item = await createWorkItem(ann, { projectId: project.id, title: "Flaky backups" });
    const m = await sendMessage(ann, {
      channelId: projectChannelId,
      body: doc("see ", ref(item.id, item.identifier)),
    });
    await toggleMessageReaction(bram, { messageId: m.id, emoji: "👀" });
    await toggleMessageReaction(ann, { messageId: m.id, emoji: "👀" });
    await toggleMessageReaction(bram, { messageId: m.id, emoji: "🎉" });
    await toggleMessageReaction(bram, { messageId: m.id, emoji: "🎉" });
    const page = await listChannelMessages(bram, projectChannelId);
    expect(page.messages[0]?.reactions).toEqual([
      { emoji: "👀", userIds: [bram.actor.userId, ann.actor.userId] },
    ]);
    expect(page.refs[item.id]).toMatchObject({
      identifier: item.identifier,
      title: "Flaky backups",
    });
    await expect(editMessage(bram, { id: m.id, body: doc("hijack") })).rejects.toThrow();
    await editMessage(ann, {
      id: m.id,
      body: doc("see ", ref(item.id, item.identifier), " again"),
    });
    expect(
      (await listChannelMessages(bram, projectChannelId)).messages[0]?.editedAt,
    ).not.toBeNull();
    // The mention shows on the item's timeline.
    const detail = await getWorkItemDetail(bram, item.identifier);
    expect(detail.references).toHaveLength(1);
    expect(detail.references[0]).toMatchObject({ kind: "MENTIONED" });
  });

  it("creates a work item from a message with a reference back", async () => {
    const { ann, bram, chloe, project } = await setup();
    const priv = await createChannel(ann, {
      name: "Incidents",
      isPrivate: true,
      memberIds: [bram.actor.userId],
    });
    const m = await sendMessage(ann, { channelId: priv.id, body: doc("The VPN drops every hour") });
    const item = await createItemFromMessage(bram, {
      messageId: m.id,
      projectId: project.id,
      title: "VPN drops every hour",
    });
    const detail = await getWorkItemDetail(bram, item.identifier);
    expect(detail.title).toBe("VPN drops every hour");
    expect(detail.references).toHaveLength(1);
    expect(detail.references[0]).toMatchObject({
      kind: "CREATED_FROM",
      message: {
        channelId: priv.id,
        channelName: "Incidents",
        excerpt: "The VPN drops every hour",
      },
    });
    // Chloé can see the item but not the private channel it came from.
    expect((await getWorkItemDetail(chloe, item.identifier)).references).toHaveLength(0);
    const page = await listChannelMessages(ann, priv.id);
    expect(page.messages[0]?.createdItems.map((i) => i.identifier)).toEqual([item.identifier]);
  });

  it("claims only the sender's own pending uploads", async () => {
    const { ann, bram, projectChannelId, ws } = await setup();
    const upload = await db.attachment.create({
      data: {
        workspaceId: ws.id,
        storageKey: `${ws.id}/messages/${crypto.randomUUID()}`,
        filename: "log.txt",
        mimeType: "text/plain",
        size: 3,
        status: "PENDING",
        uploadedById: ann.actor.userId,
      },
    });
    await expect(
      sendMessage(bram, {
        channelId: projectChannelId,
        body: doc("mine?"),
        attachmentIds: [upload.id],
      }),
    ).rejects.toThrow();
    await sendMessage(ann, {
      channelId: projectChannelId,
      body: doc(""),
      attachmentIds: [upload.id],
    });
    const page = await listChannelMessages(bram, projectChannelId);
    expect(page.messages.at(-1)?.attachments.map((a) => a.filename)).toEqual(["log.txt"]);
    await expect(
      sendMessage(ann, { channelId: projectChannelId, body: doc("") }),
    ).rejects.toThrow();
  });
});
