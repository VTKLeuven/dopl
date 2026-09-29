import MailComposer from "nodemailer/lib/mail-composer";
import type { DbClient } from "@dopl/db";
import { emitRealtime } from "../realtime";
import type { SyncDeps } from "./sync";

type Addr = { email: string; name: string | null };
const list = (v: unknown): Addr[] =>
  Array.isArray(v) ? v.filter((a): a is Addr => typeof a?.email === "string") : [];

/**
 * Phase 7b: sends one queued reply through the mailbox (users.messages.send)
 * in its Gmail thread, with In-Reply-To and References so every client
 * threads it. On success the message gets its Gmail id, so the next sync sees
 * it as known (no duplicate); on the last failed attempt it's marked FAILED
 * with the reason, shown in the reader.
 */
export async function sendReply(
  deps: Pick<SyncDeps, "db" | "gmailFor">,
  messageId: string,
  attempt: { retryCount: number; retryLimit: number },
): Promise<"sent" | "skipped"> {
  const { db } = deps;
  const m = await db.emailMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      workspaceId: true,
      direction: true,
      outboundStatus: true,
      gmailMessageId: true,
      rfc822MessageId: true,
      inReplyTo: true,
      references: true,
      fromAddress: true,
      fromName: true,
      toAddresses: true,
      ccAddresses: true,
      subject: true,
      bodyText: true,
      bodyHtmlSanitized: true,
      thread: {
        select: {
          id: true,
          gmailThreadId: true,
          mailboxId: true,
          firstResponseAt: true,
          lastInboundAt: true,
          mailbox: { select: { emailAddress: true, sendEnabled: true, deletedAt: true } },
        },
      },
    },
  });
  if (!m || m.direction !== "OUTBOUND" || m.gmailMessageId || m.outboundStatus === "SENT")
    return "skipped";
  const mailbox = m.thread.mailbox;
  await db.emailMessage.update({ where: { id: m.id }, data: { outboundStatus: "SENDING" } });
  try {
    if (!mailbox.sendEnabled || mailbox.deletedAt)
      throw new Error("Replying is turned off for this mailbox");
    const raw = await new MailComposer({
      from: { name: m.fromName ?? "", address: m.fromAddress },
      to: list(m.toAddresses).map((a) => ({ name: a.name ?? "", address: a.email })),
      cc: list(m.ccAddresses).map((a) => ({ name: a.name ?? "", address: a.email })),
      subject: m.subject,
      text: m.bodyText ?? "",
      ...(m.bodyHtmlSanitized
        ? { html: `<!doctype html><html><body>${m.bodyHtmlSanitized}</body></html>` }
        : {}),
      messageId: m.rfc822MessageId ?? undefined,
      inReplyTo: m.inReplyTo ?? undefined,
      references: m.references.join(" ") || undefined,
    })
      .compile()
      .build();
    const sent = await deps
      .gmailFor({ emailAddress: mailbox.emailAddress, sendEnabled: true })
      .send(raw.toString("base64url"), m.thread.gmailThreadId);
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.emailMessage.update({
        where: { id: m.id },
        data: { gmailMessageId: sent.id, outboundStatus: "SENT", outboundError: null, sentAt: now },
      });
      await tx.emailThread.update({
        where: { id: m.thread.id },
        data: {
          messageCount: { increment: 1 },
          lastMessageAt: now,
          lastOutboundAt: now,
          snippet: (m.bodyText ?? "").slice(0, 200),
          ...(!m.thread.firstResponseAt && m.thread.lastInboundAt ? { firstResponseAt: now } : {}),
        },
      });
      for (const topic of [`mailbox:${m.thread.mailboxId}`, `emailThread:${m.thread.id}`])
        await emitRealtime(tx, {
          workspaceId: m.workspaceId,
          topic,
          type: "email.message.sent",
          payload: { id: m.thread.id },
        });
    });
    return "sent";
  } catch (err) {
    const last = attempt.retryCount >= attempt.retryLimit;
    await markFailed(db, m, err, last);
    throw err;
  }
}

async function markFailed(
  db: DbClient,
  m: { id: string; workspaceId: string; thread: { id: string } },
  err: unknown,
  final: boolean,
) {
  await db.$transaction(async (tx) => {
    await tx.emailMessage.update({
      where: { id: m.id },
      data: {
        outboundStatus: final ? "FAILED" : "QUEUED",
        outboundError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      },
    });
    await emitRealtime(tx, {
      workspaceId: m.workspaceId,
      topic: `emailThread:${m.thread.id}`,
      type: "email.message.failed",
      payload: { id: m.thread.id },
    });
  });
}
