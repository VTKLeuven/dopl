import nodemailer from "nodemailer";
import type { DbClient } from "@dopl/db";
import { emailTemplates, renderEmail, type EmailTemplateKey } from "@dopl/shared/emails";
import { env } from "../env";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  // Explicit EHLO name: resolving the machine hostname can stall for seconds.
  name: new URL(env.APP_URL).hostname,
  ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } } : {}),
});

function isTemplateKey(key: string): key is EmailTemplateKey {
  return key in emailTemplates;
}

/** Sends one outbox row. Idempotent: rows already SENT are skipped. */
export async function sendOutboundEmail(db: DbClient, id: string): Promise<"sent" | "skipped"> {
  // Claim the row so two workers can't send the same email.
  const claimed = await db.outboundEmail.updateMany({
    where: { id, status: { in: ["QUEUED", "FAILED"] } },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";

  const row = await db.outboundEmail.findUniqueOrThrow({ where: { id } });
  try {
    if (!isTemplateKey(row.templateKey)) throw new Error(`Unknown template ${row.templateKey}`);
    const data = emailTemplates[row.templateKey].parse(row.payload);
    const rendered = renderEmail(row.templateKey, data as never, env.APP_URL);
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to: row.toAddress,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await db.outboundEmail.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        subject: rendered.subject,
        providerMessageId: info.messageId,
        error: null,
      },
    });
    return "sent";
  } catch (err) {
    await db.outboundEmail.update({
      where: { id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
    });
    throw err; // let pg-boss retry with backoff
  }
}
