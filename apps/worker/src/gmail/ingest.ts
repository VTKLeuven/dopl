import type { Logger } from "pino";
import type { DbClient, Prisma, TransactionClient } from "@dopl/db";
import { notify, type NotifyContext } from "@dopl/server/notify";
import { queueWebhookEvents, type WebhookEventInput } from "@dopl/server/webhooks";
import {
  baseSubject,
  htmlToText,
  normalizeEmail,
  parseGmailMessage,
  statusAfterMessage,
  type Address,
  type GmailMessage,
} from "@dopl/shared/domain/mail";
import { deliveryEnqueue, type TxEnqueue } from "../enqueue";
import { emitRealtime } from "../realtime";
import { sanitizeEmailHtml } from "./sanitize";

export interface MailboxRow {
  id: string;
  workspaceId: string;
  emailAddress: string;
  defaultAssigneeId: string | null;
}

export interface IngestDeps {
  db: DbClient;
  logger: Logger;
  enqueue: TxEnqueue;
}

export interface IngestOptions {
  /** The mailbox and its send-as aliases: mail from these is outbound. */
  addresses: string[];
  /**
   * Live mail (push/poll) notifies assignees and posts to Discord; backfill
   * and resync only store, or connecting a mailbox would replay 90 days.
   */
  live: boolean;
}

type Participant = { email: string; name: string | null; contactId?: string | null };

const MAX_TEXT = 200_000;

/**
 * One Gmail message → EmailThread + EmailMessage (+ attachments), idempotent
 * on (mailboxId, gmailMessageId): a message seen twice (a push and a poll, a
 * resync after a 404) only refreshes its labels.
 */
export async function ingestMessage(
  deps: IngestDeps,
  mailbox: MailboxRow,
  raw: GmailMessage,
  opts: IngestOptions,
): Promise<"created" | "updated" | "skipped"> {
  const labels = raw.labelIds ?? [];
  if (labels.includes("DRAFT") || labels.includes("CHAT")) return "skipped";
  const { db } = deps;

  const known = await db.emailMessage.findUnique({
    where: { mailboxId_gmailMessageId: { mailboxId: mailbox.id, gmailMessageId: raw.id } },
    select: { id: true, threadId: true },
  });
  if (known) {
    await db.emailMessage.update({ where: { id: known.id }, data: { gmailLabelIds: labels } });
    return "updated";
  }

  const p = parseGmailMessage(raw, opts.addresses);
  const own = new Set(opts.addresses.map(normalizeEmail));
  const safe = p.html ? sanitizeEmailHtml(p.html) : null;
  const bodyText = (p.text ?? (p.html ? htmlToText(p.html) : "")).slice(0, MAX_TEXT);
  // The person on the other side: the sender of inbound mail, the first recipient of ours.
  const counterpart: Address | undefined =
    p.direction === "INBOUND" ? p.from : [...p.to, ...p.cc].find((a) => !own.has(a.email));

  try {
    await db.$transaction(async (tx) => {
      const contact = counterpart?.email
        ? await resolveContact(tx, mailbox.workspaceId, counterpart)
        : null;

      let thread = await tx.emailThread.findUnique({
        where: {
          mailboxId_gmailThreadId: { mailboxId: mailbox.id, gmailThreadId: p.gmailThreadId },
        },
      });
      const isNewThread = !thread;
      if (!thread) {
        thread = await tx.emailThread.create({
          data: {
            workspaceId: mailbox.workspaceId,
            mailboxId: mailbox.id,
            gmailThreadId: p.gmailThreadId,
            // Backfill lists newest first, so a thread can start from a reply: drop "Re:".
            subject: baseSubject(p.subject) || p.subject || "(no subject)",
            snippet: p.snippet,
            // Mail from a blocked contact is kept but out of the way.
            status: contact?.blockedAt ? "IGNORED" : "OPEN",
            assigneeId: mailbox.defaultAssigneeId,
            contactId: contact?.id ?? null,
            lastMessageAt: p.sentAt,
          },
        });
      }

      const message = await tx.emailMessage.create({
        data: {
          workspaceId: mailbox.workspaceId,
          mailboxId: mailbox.id,
          threadId: thread.id,
          gmailMessageId: p.gmailMessageId,
          rfc822MessageId: p.rfc822MessageId,
          inReplyTo: p.inReplyTo,
          references: p.references,
          direction: p.direction,
          fromAddress: p.from.email,
          fromName: p.from.name,
          toAddresses: p.to as unknown as Prisma.InputJsonValue,
          ccAddresses: p.cc as unknown as Prisma.InputJsonValue,
          bccAddresses: p.bcc as unknown as Prisma.InputJsonValue,
          replyTo: p.replyTo,
          subject: p.subject,
          snippet: p.snippet,
          bodyText,
          bodyHtmlRaw: p.html,
          bodyHtmlSanitized: safe?.html ?? null,
          hasRemoteImages: safe?.hasRemoteImages ?? false,
          sentAt: p.sentAt,
          gmailLabelIds: labels,
          sizeEstimate: p.sizeEstimate,
          contactId: p.direction === "INBOUND" ? (contact?.id ?? null) : null,
        },
        select: { id: true },
      });
      if (p.attachments.length)
        await tx.emailAttachment.createMany({
          data: p.attachments.map((a) => ({
            messageId: message.id,
            gmailAttachmentId: a.attachmentId,
            filename: a.filename.slice(0, 255),
            mimeType: a.mimeType,
            size: a.size,
            contentId: a.contentId,
            isInline: a.isInline,
          })),
        });

      // Thread roll-up. Messages can arrive out of order (backfill pages), so compare dates.
      const latest = p.sentAt >= thread.lastMessageAt;
      const next = statusAfterMessage(thread.status, p.direction);
      const participants = mergeParticipants(
        thread.participants as unknown as Participant[],
        [p.from, ...p.to, ...p.cc].filter((a) => !own.has(a.email)),
        contact,
      );
      await tx.emailThread.update({
        where: { id: thread.id },
        data: {
          messageCount: { increment: 1 },
          ...(latest
            ? {
                lastMessageAt: p.sentAt,
                snippet: p.snippet,
                unreadInGmail: labels.includes("UNREAD"),
              }
            : {}),
          ...(p.direction === "INBOUND" &&
          (!thread.lastInboundAt || p.sentAt > thread.lastInboundAt)
            ? { lastInboundAt: p.sentAt }
            : {}),
          ...(p.direction === "OUTBOUND" &&
          (!thread.lastOutboundAt || p.sentAt > thread.lastOutboundAt)
            ? { lastOutboundAt: p.sentAt }
            : {}),
          // First reply after the first inbound message (SLA analytics).
          ...(p.direction === "OUTBOUND" &&
          !thread.firstResponseAt &&
          thread.lastInboundAt &&
          p.sentAt > thread.lastInboundAt
            ? { firstResponseAt: p.sentAt }
            : {}),
          ...(p.attachments.some((a) => !a.isInline) ? { hasAttachments: true } : {}),
          gmailLabelIds: [...new Set([...thread.gmailLabelIds, ...labels])],
          participants: participants,
          ...(opts.live && next.reopened ? { status: next.status, solvedAt: null } : {}),
          ...(!thread.contactId && contact ? { contactId: contact.id } : {}),
        },
      });

      // Realtime: the mailbox's lists, the open thread, and items that link to it.
      const events: Array<{ topic: string; type: string }> = [
        {
          topic: `mailbox:${mailbox.id}`,
          type: isNewThread ? "email.thread.created" : "email.thread.updated",
        },
        { topic: `emailThread:${thread.id}`, type: "email.message.created" },
      ];
      const links = await tx.workItemReference.findMany({
        where: { emailThreadId: thread.id },
        select: { workItemId: true },
      });
      for (const l of links)
        events.push({ topic: `workItem:${l.workItemId}`, type: "workItem.reference" });
      for (const e of events)
        await emitRealtime(tx, {
          workspaceId: mailbox.workspaceId,
          topic: e.topic,
          type: e.type,
          payload: { id: thread.id },
        });

      if (!opts.live) return;

      // Inbox: the assignee hears about new inbound mail (one row per thread).
      if (p.direction === "INBOUND" && thread.assigneeId) {
        const n = jobNotifyContext(tx, mailbox.workspaceId);
        await notify(n.ctx, {
          recipientIds: [thread.assigneeId],
          type: "EMAIL_REPLY",
          entityType: "EMAIL_THREAD",
          entityId: thread.id,
          emailThreadId: thread.id,
          groupKey: `email:${thread.id}`,
          data: {
            subject: thread.subject,
            from: p.from.name ?? p.from.email,
            mailbox: mailbox.emailAddress,
            reopened: next.reopened,
          },
        });
        await n.flush();
      }

      // Discord (D-052): new threads and new inbound messages, per mailbox filter.
      const hooks: WebhookEventInput[] = [];
      if (isNewThread)
        hooks.push({
          event: "email_thread.created",
          entityType: "EMAIL_THREAD",
          entityId: thread.id,
          projectId: null,
          mailboxId: mailbox.id,
        });
      else if (p.direction === "INBOUND")
        hooks.push({
          event: "email_message.received",
          entityType: "EMAIL_THREAD",
          entityId: thread.id,
          projectId: null,
          mailboxId: mailbox.id,
          detail: { messageId: message.id },
        });
      if (hooks.length)
        await queueWebhookEvents(tx, mailbox.workspaceId, hooks, deliveryEnqueue(deps.enqueue));
    });
  } catch (err) {
    // Another sync stored the same message first: that's the idempotency we want.
    if ((err as { code?: string }).code === "P2002") return "updated";
    throw err;
  }
  return "created";
}

/**
 * A job's notify() context: no human actor. notify() emits synchronously, so
 * events are collected and written to the outbox by flush(), inside the
 * transaction.
 */
function jobNotifyContext(tx: TransactionClient, workspaceId: string) {
  const events: Array<Parameters<NotifyContext["emit"]>[0]> = [];
  const ctx: NotifyContext = {
    tx,
    workspaceId,
    actor: { userId: null },
    emit: (e) => events.push(e),
  };
  return {
    ctx,
    flush: async () => {
      for (const e of events.splice(0)) await emitRealtime(tx, { workspaceId, ...e });
    },
  };
}

/**
 * The correspondent's Contact: found by normalized address, created on first
 * mail (DATA_MODEL §3.4). Team members aren't contacts.
 */
async function resolveContact(tx: TransactionClient, workspaceId: string, who: Address) {
  const email = normalizeEmail(who.email);
  const member = await tx.workspaceMember.findFirst({
    where: { workspaceId, user: { email } },
    select: { userId: true },
  });
  if (member) return null;
  const contact = await tx.contact.upsert({
    where: { workspaceId_emailNormalized: { workspaceId, emailNormalized: email } },
    create: {
      workspaceId,
      email: who.email,
      emailNormalized: email,
      name: who.name,
      firstSource: "EMAIL",
      lastSeenAt: new Date(),
    },
    update: { lastSeenAt: new Date() },
    select: { id: true, blockedAt: true },
  });
  return contact;
}

function mergeParticipants(
  current: Participant[],
  add: Address[],
  contact: { id: string } | null,
): Participant[] {
  const out = [...(Array.isArray(current) ? current : [])];
  for (const a of add) {
    if (!a.email || out.some((p) => p.email === a.email)) continue;
    out.push({ email: a.email, name: a.name, contactId: null });
  }
  if (contact && out[0] && !out[0].contactId) out[0] = { ...out[0], contactId: contact.id };
  return out.slice(0, 50);
}
