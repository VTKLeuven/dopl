import { describe, expect, it } from "vitest";
import { db } from "../db";
import {
  getMailboxAdmin,
  getPersonalMailbox,
  getThread,
  listMailboxes,
  listMailboxesForAdmin,
  listThreads,
} from "../queries/mail";
import { getWorkItemDetail } from "../queries/work-items";
import { TopicAccess } from "../realtime/access";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import {
  addEmailComment,
  assignThread,
  connectPersonalMailbox,
  createIgnoreRule,
  createMailbox,
  promoteThread,
  setMailboxState,
  updateMailbox,
} from "./mail";
import { setMemberActive } from "./members";

const mention = (id: string) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "mention", attrs: { id, label: "x" } },
        { type: "text", text: " look" },
      ],
    },
  ],
});

/** Mia connects her own mailbox, next to a shared one she isn't a member of. */
async function setup() {
  const ws = await makeWorkspace();
  const admin = await makeMember(ws, "ADMIN", "Ann Admin");
  const mia = await makeMember(ws, "MEMBER", "Mia Member");
  const otto = await makeMember(ws, "MEMBER", "Otto Other");
  const guest = await makeMember(ws, "GUEST", "Gus Guest");
  const shared = await createMailbox(admin, { emailAddress: `it-${ws.slug}@vtk.test` });
  const { id: mailboxId } = await connectPersonalMailbox(mia, {});
  await db.mailbox.update({ where: { id: mailboxId }, data: { status: "ACTIVE" } });
  const thread = await db.emailThread.create({
    data: {
      workspaceId: ws.id,
      mailboxId,
      gmailThreadId: `p-${ws.slug}`,
      subject: "Your contract",
      assigneeId: mia.actor.userId,
      lastMessageAt: new Date(),
      messages: {
        create: {
          workspaceId: ws.id,
          mailboxId,
          gmailMessageId: `pm-${ws.slug}`,
          direction: "INBOUND",
          fromAddress: "hr@example.test",
          subject: "Your contract",
          bodyText: "Salary details inside.",
          sentAt: new Date(),
        },
      },
    },
  });
  return { ws, admin, mia, otto, guest, shared, mailboxId, thread };
}

describe("personal mailboxes (D-138)", () => {
  it("connects the address on your account only, tested by the worker and audited", async () => {
    const { mia, otto, guest, mailboxId } = await setup();
    const row = await db.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
    expect(row).toMatchObject({
      emailAddress: mia.actor.email,
      ownerId: mia.actor.userId,
      defaultAssigneeId: mia.actor.userId,
    });
    const job = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM pgboss.job WHERE name = 'gmail.test' AND data->>'mailboxId' = ${mailboxId}`;
    expect(Number(job[0]?.n)).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { targetId: mailboxId } });
    expect(log).toMatchObject({ action: "mailbox.connected", metadata: { personal: true } });
    // Once, and never for guests.
    await expect(connectPersonalMailbox(mia, {})).rejects.toThrow("mailbox_exists");
    await expect(connectPersonalMailbox(guest, {})).rejects.toThrow();
    // Naming someone else's address doesn't open their mailbox: you always get your own.
    const own = await connectPersonalMailbox(otto, { emailAddress: mia.actor.email });
    expect((await db.mailbox.findUniqueOrThrow({ where: { id: own.id } })).emailAddress).toBe(
      otto.actor.email,
    );
  });

  it("is invisible to everyone else, admins included", async () => {
    const { admin, mia, otto, shared, mailboxId, thread } = await setup();
    // Mia sees her own mailbox, not the shared one she isn't a member of.
    expect((await listMailboxes(mia)).map((m) => [m.id, m.personal])).toEqual([[mailboxId, true]]);
    expect((await listThreads(mia, { view: "mine" })).rows.map((r) => r.id)).toEqual([thread.id]);
    const detail = await getThread(mia, thread.id);
    expect(detail).toMatchObject({ canAct: true, canManage: true, mailbox: { personal: true } });
    expect(detail.assignable.map((p) => p.name)).toEqual(["Mia Member"]);
    expect((await getPersonalMailbox(mia))?.id).toBe(mailboxId);

    for (const other of [admin, otto]) {
      expect((await listMailboxes(other)).map((m) => m.id)).not.toContain(mailboxId);
      expect((await listThreads(other, { view: "all" })).rows).toEqual([]);
      await expect(getThread(other, thread.id)).rejects.toThrow();
      await expect(getMailboxAdmin(other, mailboxId)).rejects.toThrow();
      expect(await getPersonalMailbox(other)).toBeNull();
      await expect(setMailboxState(other, mailboxId, "pause")).rejects.toThrow();
      await expect(
        assignThread(other, { threadId: thread.id, assigneeId: other.actor.userId }),
      ).rejects.toThrow();
    }
    expect((await listMailboxesForAdmin(admin)).map((m) => m.id)).toEqual([shared.id]);

    // Realtime follows the same rule.
    const msg = (topic: string) => ({ id: "1", workspaceId: "", topic, type: "x", payload: {} });
    const adminAccess = new TopicAccess(admin);
    const miaAccess = new TopicAccess(mia);
    await Promise.all([adminAccess.refresh(), miaAccess.refresh()]);
    expect(await adminAccess.allows(msg(`mailbox:${mailboxId}`))).toBe(false);
    expect(await adminAccess.allows(msg(`emailThread:${thread.id}`))).toBe(false);
    expect(await miaAccess.allows(msg(`mailbox:${mailboxId}`))).toBe(true);
    expect(await miaAccess.allows(msg(`emailThread:${thread.id}`))).toBe(true);
  });

  it("is worked by its owner alone: assignees, mentions, settings", async () => {
    const { admin, mia, mailboxId, thread } = await setup();
    await expect(
      assignThread(mia, { threadId: thread.id, assigneeId: admin.actor.userId }),
    ).rejects.toThrow("assignee_cannot_read");
    await addEmailComment(mia, { threadId: thread.id, body: mention(admin.actor.userId) });
    expect(await db.notification.count({ where: { recipientId: admin.actor.userId } })).toBe(0);
    await expect(
      updateMailbox(mia, { id: mailboxId, memberIds: [admin.actor.userId] }),
    ).rejects.toThrow("personal_mailbox");
    await updateMailbox(mia, { id: mailboxId, displayName: "Mine", sendEnabled: true });
    // An ignore rule on your own mail doesn't put its text in the admins' audit log.
    await createIgnoreRule(mia, { mailboxId, field: "SENDER", value: "hr@example" });
    const log = await db.auditLog.findFirstOrThrow({
      where: { targetId: mailboxId, action: "mailbox.ignore_rule.created" },
    });
    expect(JSON.stringify(log.metadata)).not.toContain("hr@example");
  });

  it("shows teammates only that a private email is linked to an item", async () => {
    const { admin, mia, otto, thread } = await setup();
    const project = await makeProject(admin);
    const item = await promoteThread(mia, {
      threadId: thread.id,
      projectId: project.id,
      title: "Contract follow-up",
    });
    const mine = (await getWorkItemDetail(mia, item.identifier)).references.find(
      (r) => r.source === "email",
    );
    expect(mine).toMatchObject({ thread: { readable: true, subject: "Your contract" } });
    const theirs = (await getWorkItemDetail(otto, item.identifier)).references.find(
      (r) => r.source === "email",
    );
    expect(theirs).toMatchObject({
      thread: { readable: false, personal: true, subject: "", mailbox: "", messages: [] },
    });
  });

  it("keeps team addresses for the team, and stops syncing when its owner leaves", async () => {
    const { ws, admin, mia, otto, mailboxId } = await setup();
    // A shared mailbox can't take over someone's personal address, even disconnected.
    await expect(createMailbox(admin, { emailAddress: mia.actor.email })).rejects.toThrow(
      "mailbox_exists",
    );
    await setMailboxState(mia, mailboxId, "disconnect");
    await expect(createMailbox(admin, { emailAddress: mia.actor.email })).rejects.toThrow(
      "mailbox_exists",
    );
    // …and nobody connects an address the team already tracks as their own.
    await createMailbox(admin, { emailAddress: otto.actor.email });
    await expect(connectPersonalMailbox(otto, {})).rejects.toThrow("mailbox_shared");

    // Reconnecting brings Mia's mailbox back; deactivating her pauses it.
    await connectPersonalMailbox(mia, {});
    const member = await db.workspaceMember.findFirstOrThrow({
      where: { workspaceId: ws.id, userId: mia.actor.userId },
    });
    await setMemberActive(admin, member.id, false);
    const row = await db.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
    expect(row).toMatchObject({ status: "PAUSED", deletedAt: null });
  });
});
