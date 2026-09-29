import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import pino from "pino";
import { createDbClient } from "@dopl/db";
import type { TxEnqueue } from "../enqueue";
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
  const enqueue: TxEnqueue = async (_tx, queue, payload) => {
    jobs.push({ queue, payload });
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
});
