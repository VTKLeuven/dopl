import "server-only";
import type { TransactionClient } from "@dopl/db";
import { emailTemplates, type EmailTemplateData, type EmailTemplateKey } from "@dopl/shared/emails";
import { enqueue } from "../jobs";

/** Queue a transactional email; the worker renders and sends it (D-036). */
export async function queueEmail<K extends EmailTemplateKey>(
  tx: TransactionClient,
  args: {
    template: K;
    to: string;
    data: EmailTemplateData<K>;
    workspaceId?: string | null;
    userId?: string | null;
    contactId?: string | null;
  },
): Promise<void> {
  const payload = emailTemplates[args.template].parse(args.data);
  const row = await tx.outboundEmail.create({
    data: {
      kind: args.template,
      templateKey: args.template,
      toAddress: args.to,
      subject: args.template,
      payload,
      workspaceId: args.workspaceId ?? null,
      userId: args.userId ?? null,
      contactId: args.contactId ?? null,
    },
    select: { id: true },
  });
  await enqueue(tx, "email.send", { outboundEmailId: row.id });
}
