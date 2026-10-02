import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import pino from "pino";
import { createDbClient } from "@dopl/db";
import type { TxEnqueue } from "../enqueue";
import { writeStore } from "@dopl/shared/testing/fake-gmail";
import { appendMessage, expireHistory, FakeGmail, readStore } from "./fake";
import { sendReply } from "./send";
import { backfill, sync, testConnection, type SyncDeps } from "./sync";

const db = createDbClient({
  connectionString: process.env.DATABASE_URL ?? "",
  applicationName: "dopl-worker-test",
  maxConnections: 2,
});
const logger = pino({ level: "silent" });

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), "dopl-gmail-"));
  const ws = await db.workspace.create({
    data: { slug: `m-${crypto.randomUUID().slice(0, 8)}`, name: "VTK IT" },
  });
  const user = await db.user.create({
    data: { email: `${crypto.randomUUID()}@dopl.test`, name: "Ann Assignee", emailVerified: true },
  });
  await db.workspaceMember.create({
    data: { workspaceId: ws.id, userId: user.id, role: "MEMBER", status: "ACTIVE" },
  });
  const address = `it-${crypto.randomUUID().slice(0, 6)}@vtk.test`;
  const mailbox = await db.mailbox.create({
    data: { workspaceId: ws.id, emailAddress: address, defaultAssigneeId: user.id },
  });
  await db.outgoingWebhook.create({
    data: {
      workspaceId: ws.id,
      name: "Discord",
      urlEncrypted: "x",
      urlHint: "…",
      events: ["email_thread.created", "email_message.received"],
    },
  });
  const jobs: Array<{ queue: string; payload: unknown }> = [];
  const enqueue: TxEnqueue = (_tx, queue, payload) => {
    jobs.push({ queue, payload });
    return Promise.resolve();
  };
  const deps: SyncDeps = {
    db,
    logger,
    enqueue,
    gmailFor: (m) => new FakeGmail(dir, m.emailAddress),
    pubsubTopic: null,
  };
  return { dir, ws, user, address, mailbox, jobs, deps };
}

const count = (mailboxId: string) =>
  Promise.all([
    db.emailThread.count({ where: { mailboxId } }),
    db.emailMessage.count({ where: { mailboxId } }),
  ]);

describe("gmail sync", () => {
  it("tests the connection, backfills quietly, then syncs live mail", async () => {
    const { dir, address, mailbox, user, jobs, deps } = await setup();
    // Mail that was already there before connecting.
    const old = await appendMessage(dir, address, {
      from: "lotte@student.example.test",
      fromName: "Lotte Peeters",
      subject: "Printer on the 2nd floor",
      text: "It's out of toner.",
      html: '<p onclick="x()">It\'s out of toner.</p><script>alert(1)</script>',
    });

    expect(await testConnection(deps, mailbox.id)).toBe(true);
    expect(jobs.map((j) => j.queue)).toEqual(["gmail.backfill"]);
    jobs.length = 0;

    await backfill(deps, mailbox.id, "BACKFILL");
    const after = await db.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.backfillCompletedAt).not.toBeNull();
    expect(await count(mailbox.id)).toEqual([1, 1]);
    // Backfill stores only: no notifications, no Discord posts.
    expect(jobs).toEqual([]);
    expect(await db.notification.count({ where: { recipientId: user.id } })).toBe(0);

    const msg = await db.emailMessage.findFirstOrThrow({ where: { mailboxId: mailbox.id } });
    expect(msg.bodyHtmlSanitized).not.toMatch(/script|onclick/);
    expect(msg.direction).toBe("INBOUND");
    const thread = await db.emailThread.findFirstOrThrow({ where: { mailboxId: mailbox.id } });
    expect(thread.assigneeId).toBe(user.id);
    const contact = await db.contact.findUniqueOrThrow({ where: { id: thread.contactId! } });
    expect(contact.emailNormalized).toBe("lotte@student.example.test");

    // We reply, then solve; the customer writes back and the thread reopens.
    await appendMessage(dir, address, {
      from: address,
      to: "lotte@student.example.test",
      subject: "Re: Printer on the 2nd floor",
      text: "On it.",
      threadId: old.threadId,
      labelIds: ["SENT"],
    });
    await sync(deps, mailbox.id, "push");
    let t = await db.emailThread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(t.firstResponseAt).not.toBeNull();
    await db.emailThread.update({
      where: { id: thread.id },
      data: { status: "SOLVED", solvedAt: new Date() },
    });

    await appendMessage(dir, address, {
      from: "lotte@student.example.test",
      subject: "Re: Printer on the 2nd floor",
      text: "Still broken!",
      threadId: old.threadId,
    });
    await sync(deps, mailbox.id, "push");
    t = await db.emailThread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(t.status).toBe("OPEN");
    expect(t.solvedAt).toBeNull();
    expect(t.messageCount).toBe(3);
    // Live mail notifies the assignee (one row per thread) and posts to Discord.
    const n = await db.notification.findMany({ where: { recipientId: user.id } });
    expect(n.map((x) => x.type)).toEqual(["EMAIL_REPLY"]);
    expect(jobs.filter((j) => j.queue === "webhook.deliver")).toHaveLength(1);

    // A brand-new thread posts email_thread.created.
    await appendMessage(dir, address, { from: "new@example.test", subject: "VPN?", text: "Hi" });
    await sync(deps, mailbox.id, "poll");
    const deliveries = await db.webhookDelivery.findMany({
      where: { workspaceId: mailbox.workspaceId },
      select: { eventType: true },
    });
    expect(deliveries.map((d) => d.eventType).sort()).toEqual([
      "email_message.received",
      "email_thread.created",
    ]);
    expect(await count(mailbox.id)).toEqual([2, 4]);
  });

  it("ignores mail that matches a rule, quietly, and keeps a group's real sender", async () => {
    const { dir, address, mailbox, user, jobs, deps } = await setup();
    await db.mailIgnoreRule.createMany({
      data: [
        {
          workspaceId: mailbox.workspaceId,
          mailboxId: mailbox.id,
          field: "SENDER",
          value: "renovate",
        },
        {
          workspaceId: mailbox.workspaceId,
          mailboxId: mailbox.id,
          field: "SUBJECT",
          value: "report domain:",
        },
      ],
    });
    await testConnection(deps, mailbox.id);
    await backfill(deps, mailbox.id, "BACKFILL");
    jobs.length = 0;

    // Through a Google Group: From is the group, the real sender is in X-Original-From.
    const bot = await appendMessage(dir, address, {
      from: "it@vtk.test",
      fromName: "'renovate[bot]' via IT",
      subject: "[VTKLeuven/site] chore(deps): update dependency next",
      text: "This PR contains the following updates.",
      headers: [{ name: "X-Original-From", value: "renovate[bot] <notifications@github.test>" }],
    });
    await appendMessage(dir, address, {
      from: "noreply-dmarc-support@google.test",
      subject: "Report domain: vtk.be Submitter: google.com Report-ID: 123",
      text: "This is an aggregate report.",
    });
    await appendMessage(dir, address, {
      from: "it@vtk.test",
      fromName: "'Lotte Peeters' via IT",
      subject: "Projector broken",
      text: "No signal.",
      headers: [{ name: "X-Original-From", value: "Lotte Peeters <lotte@example.test>" }],
    });
    await sync(deps, mailbox.id, "push");

    const threads = await db.emailThread.findMany({
      where: { mailboxId: mailbox.id },
      orderBy: { subject: "asc" },
      select: { id: true, subject: true, status: true, contact: { select: { email: true } } },
    });
    expect(threads.map((t) => [t.subject.slice(0, 16), t.status, t.contact?.email])).toEqual([
      ["Projector broken", "OPEN", "lotte@example.test"],
      ["Report domain: v", "IGNORED", "noreply-dmarc-support@google.test"],
      ["[VTKLeuven/site]", "IGNORED", "notifications@github.test"],
    ]);
    const stored = await db.emailMessage.findFirstOrThrow({
      where: { mailboxId: mailbox.id, gmailMessageId: bot.id },
    });
    expect([stored.fromAddress, stored.fromName]).toEqual([
      "notifications@github.test",
      "renovate[bot]",
    ]);
    // Only the real mail notifies its assignee and reaches Discord.
    const n = await db.notification.findMany({ where: { recipientId: user.id } });
    expect(n).toHaveLength(1);
    expect(n[0]?.emailThreadId).toBe(threads[0]?.id);
    expect(jobs.filter((j) => j.queue === "webhook.deliver")).toHaveLength(1);

    // A matching message doesn't reopen a solved thread; other mail still does.
    const dmarc = threads[1]!;
    await db.emailThread.update({ where: { id: dmarc.id }, data: { status: "SOLVED" } });
    const dmarcGmail = await db.emailThread.findUniqueOrThrow({ where: { id: dmarc.id } });
    await appendMessage(dir, address, {
      from: "noreply-dmarc-support@google.test",
      subject: "Re: Report domain: vtk.be",
      text: "Another one.",
      threadId: dmarcGmail.gmailThreadId,
    });
    await sync(deps, mailbox.id, "push");
    expect((await db.emailThread.findUniqueOrThrow({ where: { id: dmarc.id } })).status).toBe(
      "SOLVED",
    );
  });

  it("resyncs after a history 404 without duplicating anything", async () => {
    const { dir, address, mailbox, jobs, deps } = await setup();
    await appendMessage(dir, address, { from: "a@example.test", subject: "One", text: "1" });
    await testConnection(deps, mailbox.id);
    await backfill(deps, mailbox.id, "BACKFILL");
    await appendMessage(dir, address, { from: "b@example.test", subject: "Two", text: "2" });
    jobs.length = 0;

    // Gmail forgets the history we're at: the partial sync gets a 404.
    await expireHistory(dir, address);
    await appendMessage(dir, address, { from: "c@example.test", subject: "Three", text: "3" });
    await sync(deps, mailbox.id, "push");
    expect(jobs).toEqual([
      { queue: "gmail.backfill", payload: { mailboxId: mailbox.id, kind: "FULL_RESYNC" } },
    ]);

    await backfill(deps, mailbox.id, "FULL_RESYNC");
    expect(await count(mailbox.id)).toEqual([3, 3]);
    const logs = await db.mailboxSyncLog.findMany({
      where: { mailboxId: mailbox.id },
      orderBy: { startedAt: "asc" },
      select: { kind: true, error: true },
    });
    expect(logs.map((l) => l.kind)).toContain("FULL_RESYNC");
    expect(logs.find((l) => l.kind === "PARTIAL" && l.error)?.error).toBe("history_gone");

    // And a second resync changes nothing.
    await backfill(deps, mailbox.id, "FULL_RESYNC");
    expect(await count(mailbox.id)).toEqual([3, 3]);
  });

  it("fails the connection test for a token that belongs to another address", async () => {
    const { mailbox, deps } = await setup();
    const wrong: SyncDeps = {
      ...deps,
      gmailFor: () => new FakeGmail("/tmp/none", "someone-else@vtk.test"),
    };
    expect(await testConnection(wrong, mailbox.id)).toBe(false);
    const m = await db.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } });
    expect(m.status).toBe("ERROR");
    expect(m.syncError).toMatch(/someone-else/);
  });
});

describe("gmail send (Phase 7b)", () => {
  it("sends a queued reply in the thread, then the sync doesn't duplicate it", async () => {
    const { dir, address, mailbox, deps } = await setup();
    const first = await appendMessage(dir, address, {
      from: "lotte@example.test",
      subject: "Printer",
      text: "Broken",
    });
    await testConnection(deps, mailbox.id);
    await backfill(deps, mailbox.id, "BACKFILL");
    await db.mailbox.update({ where: { id: mailbox.id }, data: { sendEnabled: true } });
    const thread = await db.emailThread.findFirstOrThrow({ where: { mailboxId: mailbox.id } });
    const inbound = await db.emailMessage.findFirstOrThrow({ where: { threadId: thread.id } });
    const reply = await db.emailMessage.create({
      data: {
        workspaceId: mailbox.workspaceId,
        mailboxId: mailbox.id,
        threadId: thread.id,
        direction: "OUTBOUND",
        rfc822MessageId: "<reply-1@vtk.test>",
        inReplyTo: inbound.rfc822MessageId,
        references: [inbound.rfc822MessageId ?? ""],
        fromAddress: address,
        toAddresses: [{ email: "lotte@example.test", name: null }],
        subject: "Re: Printer",
        bodyText: "We're on it.",
        bodyHtmlSanitized: "<p>We're on it.</p>",
        sentAt: new Date(),
        outboundStatus: "QUEUED",
      },
    });

    expect(await sendReply(deps, reply.id, { retryCount: 0, retryLimit: 5 })).toBe("sent");
    const sent = await db.emailMessage.findUniqueOrThrow({ where: { id: reply.id } });
    expect(sent.outboundStatus).toBe("SENT");
    expect(sent.gmailMessageId).not.toBeNull();
    const store = await readStore(dir, address);
    const inGmail = store.messages[sent.gmailMessageId!];
    expect(inGmail?.threadId).toBe(first.threadId);
    expect(inGmail?.payload?.headers?.find((h) => h.name === "In-Reply-To")?.value).toBe(
      inbound.rfc822MessageId,
    );
    const t = await db.emailThread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(t.firstResponseAt).not.toBeNull();
    expect(t.messageCount).toBe(2);

    await sync(deps, mailbox.id, "push");
    expect(await db.emailMessage.count({ where: { threadId: thread.id } })).toBe(2);
  });

  it("marks a reply failed after the last attempt, with the reason", async () => {
    const { mailbox, deps, address } = await setup();
    const thread = await db.emailThread.create({
      data: {
        workspaceId: mailbox.workspaceId,
        mailboxId: mailbox.id,
        gmailThreadId: "t",
        subject: "x",
        lastMessageAt: new Date(),
      },
    });
    const reply = await db.emailMessage.create({
      data: {
        workspaceId: mailbox.workspaceId,
        mailboxId: mailbox.id,
        threadId: thread.id,
        direction: "OUTBOUND",
        fromAddress: address,
        subject: "Re: x",
        sentAt: new Date(),
        outboundStatus: "QUEUED",
      },
    });
    // Replying is off for this mailbox.
    await expect(sendReply(deps, reply.id, { retryCount: 5, retryLimit: 5 })).rejects.toThrow(
      /turned off/,
    );
    const failed = await db.emailMessage.findUniqueOrThrow({ where: { id: reply.id } });
    expect(failed.outboundStatus).toBe("FAILED");
    expect(failed.outboundError).toMatch(/turned off/);
  });

  it("keeps personal mail private and the team's mail in the shared mailbox (D-138)", async () => {
    const { dir, address: shared, mailbox, user, jobs, deps } = await setup();
    const own = `bram-${crypto.randomUUID().slice(0, 6)}@vtk.test`;
    const personal = await db.mailbox.create({
      data: {
        workspaceId: mailbox.workspaceId,
        emailAddress: own,
        ownerId: user.id,
        defaultAssigneeId: user.id,
      },
    });
    for (const m of [mailbox, personal]) {
      await testConnection(deps, m.id);
      await backfill(deps, m.id, "BACKFILL");
    }
    jobs.length = 0;
    const deliver = (to: string, messageId: string, extra: Record<string, unknown> = {}) =>
      appendMessage(dir, to, {
        from: "lotte@example.test",
        to: "someone@example.test",
        subject: `Mail ${messageId}`,
        text: "Hi",
        messageId,
        ...extra,
      });

    // 1. Addressed to the shared mailbox (a group the owner is on): never stored as personal.
    await deliver(own, "<group@x>", { to: shared });
    // 2. A copy the shared mailbox already holds (a Bcc to the group): skipped by Message-ID.
    await deliver(shared, "<bcc@x>");
    await sync(deps, mailbox.id, "push");
    await deliver(own, "<bcc@x>");
    // 3. The personal mailbox syncs first; the shared copy arrives later and takes over.
    await deliver(own, "<race@x>");
    // 4. A forged Message-ID from someone else doesn't make personal mail the team's.
    await appendMessage(dir, own, {
      from: "other@example.test",
      to: own,
      subject: "Private",
      text: "Just for you",
      messageId: "<bcc@x>",
    });
    // 5. Plain personal mail from someone the team doesn't know.
    await appendMessage(dir, own, {
      from: "friend@example.test",
      to: own,
      subject: "Lunch?",
      text: "Friday",
    });
    await sync(deps, personal.id, "push");
    const subjects = async (mailboxId: string) =>
      (await db.emailThread.findMany({ where: { mailboxId }, select: { subject: true } }))
        .map((t) => t.subject)
        .sort();
    expect(await subjects(personal.id)).toEqual(["Lunch?", "Mail <race@x>", "Private"]);

    await deliver(shared, "<race@x>");
    await sync(deps, mailbox.id, "push");
    expect(await subjects(personal.id)).toEqual(["Lunch?", "Private"]);
    expect(await subjects(mailbox.id)).toEqual(["Mail <bcc@x>", "Mail <race@x>"]);

    // Personal mail is the owner's, adds no contacts, and stays off the Inbox and Discord.
    const lunch = await db.emailThread.findFirstOrThrow({
      where: { mailboxId: personal.id, subject: "Lunch?" },
    });
    expect(lunch.assigneeId).toBe(user.id);
    expect(lunch.contactId).toBeNull();
    expect(
      await db.contact.count({
        where: { workspaceId: mailbox.workspaceId, emailNormalized: "friend@example.test" },
      }),
    ).toBe(0);
    expect(
      await db.notification.count({
        where: { recipientId: user.id, emailThreadId: lunch.id },
      }),
    ).toBe(0);
    const posted = await db.webhookDelivery.findMany({
      where: { workspaceId: mailbox.workspaceId },
      select: { eventType: true },
    });
    // Only the shared mailbox's two new threads.
    expect(posted).toHaveLength(2);
  });

  it("remembers a shared mailbox's aliases, so mail to them stays out of personal ones", async () => {
    const { dir, address: shared, mailbox, user, deps } = await setup();
    const store = await readStore(dir, shared);
    store.sendAs = ["it-alias@vtk.test"];
    await writeStore(dir, shared, store);
    const own = `bram-${crypto.randomUUID().slice(0, 6)}@vtk.test`;
    const personal = await db.mailbox.create({
      data: { workspaceId: mailbox.workspaceId, emailAddress: own, ownerId: user.id },
    });
    await testConnection(deps, mailbox.id);
    await backfill(deps, mailbox.id, "BACKFILL");
    expect((await db.mailbox.findUniqueOrThrow({ where: { id: mailbox.id } })).aliases).toEqual([
      "it-alias@vtk.test",
    ]);
    await appendMessage(dir, own, {
      from: "lotte@example.test",
      to: "IT <IT-Alias@vtk.test>",
      subject: "Projector",
      text: "Broken",
    });
    await testConnection(deps, personal.id);
    await backfill(deps, personal.id, "BACKFILL");
    expect(await count(personal.id)).toEqual([0, 0]);
  });
});
