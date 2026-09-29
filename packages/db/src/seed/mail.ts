/**
 * Shared-mailbox seed (Phase 7): the IT mailbox with Bram and Chloé as
 * members, and a handful of conversations written into the fake Gmail
 * (GMAIL_FAKE_DIR). The worker connects it on start (CONNECTING → test →
 * backfill), exactly as it would a real mailbox. Without GMAIL_FAKE_DIR the
 * mailbox is still created, and stays waiting for real credentials.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { appendMessage, fakeStoreFile } from "@dopl/shared/testing/fake-gmail";
import type { DbClient } from "../client";

export const SEED_MAILBOX = "it@vtk.be";

const HOUR = 60 * 60 * 1000;

export async function seedMail(
  db: DbClient,
  opts: { workspaceId: string; memberEmails: string[]; now?: Date },
): Promise<number> {
  const now = opts.now ?? new Date();
  const users = await db.user.findMany({
    where: { email: { in: opts.memberEmails } },
    select: { id: true },
  });
  const existing = await db.mailbox.findFirst({
    where: { workspaceId: opts.workspaceId, emailAddress: SEED_MAILBOX },
    select: { id: true },
  });
  if (existing) await db.mailbox.delete({ where: { id: existing.id } });
  const mailbox = await db.mailbox.create({
    data: {
      workspaceId: opts.workspaceId,
      emailAddress: SEED_MAILBOX,
      displayName: "IT support",
      backfillDays: 30,
      status: "CONNECTING",
      members: {
        createMany: {
          data: users.map((u) => ({ userId: u.id, workspaceId: opts.workspaceId })),
        },
      },
    },
    select: { id: true },
  });

  const rel = process.env.GMAIL_FAKE_DIR;
  if (!rel) return 0;
  const dir = path.resolve(import.meta.dirname, "../../../..", rel);
  await rm(fakeStoreFile(dir, SEED_MAILBOX), { force: true });
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR);
  const send = (input: Parameters<typeof appendMessage>[2]) =>
    appendMessage(dir, SEED_MAILBOX, input);

  const printer = await send({
    from: "lotte.peeters@student.example.test",
    fromName: "Lotte Peeters",
    subject: "Printer on the 2nd floor is out of toner",
    text: "Hi IT,\n\nThe printer next to the meeting room on the 2nd floor has been blinking 'toner low' since this morning and now refuses to print.\n\nThanks!\nLotte",
    date: at(52),
  });
  await send({
    from: SEED_MAILBOX,
    fromName: "IT support",
    to: "lotte.peeters@student.example.test",
    subject: "Re: Printer on the 2nd floor is out of toner",
    text: "Hi Lotte,\n\nThanks for letting us know, we'll swap the cartridge this afternoon.\n\nBram",
    threadId: printer.threadId,
    inReplyTo: printer.messageId,
    labelIds: ["SENT"],
    date: at(50),
  });
  await send({
    from: "lotte.peeters@student.example.test",
    fromName: "Lotte Peeters",
    subject: "Re: Printer on the 2nd floor is out of toner",
    text: "It prints again, but the pages come out with a grey stripe on the left.",
    threadId: printer.threadId,
    inReplyTo: printer.messageId,
    date: at(3),
  });
  await send({
    from: "jonas.maes@example.test",
    fromName: "Jonas Maes",
    subject: "VPN keeps dropping every 10 minutes",
    html: `<p>Hello,</p><p>Since Monday my <b>VPN</b> connection drops every 10 minutes, both on eduroam and at home.</p>
<ul><li>Windows 11</li><li>WireGuard client 0.5.3</li></ul>
<p>Kind regards,<br>Jonas</p>
<img src="https://tracker.example.test/open.gif" width="1" height="1">
<script>alert("this never runs")</script>`,
    text: "Hello,\n\nSince Monday my VPN connection drops every 10 minutes, both on eduroam and at home.\n\n- Windows 11\n- WireGuard client 0.5.3\n\nKind regards,\nJonas",
    date: at(20),
  });
  await send({
    from: "sara.claes@example.test",
    fromName: "Sara Claes",
    subject: "Access to the shared drive for VTK Sport",
    text: "Could you give the new board members of VTK Sport access to the Sport shared drive? The list is attached.",
    attachments: [
      {
        filename: "board-2026.csv",
        mimeType: "text/csv",
        content: "name,email\nSara,sara@example.test\n",
      },
    ],
    date: at(8),
  });
  await send({
    from: "news@vendor.example.test",
    fromName: "Vendor news",
    subject: "Your monthly product update",
    html: "<h1>What's new</h1><p>Five features you'll love.</p>",
    date: at(30),
  });
  await send({
    from: "wout.jacobs@example.test",
    subject: "Wi-Fi password for the event on Friday?",
    text: "Hi, what's the guest Wi-Fi password for Friday's event in the aula? We have about 80 guests.",
    date: at(1),
  });
  return 6;
}
