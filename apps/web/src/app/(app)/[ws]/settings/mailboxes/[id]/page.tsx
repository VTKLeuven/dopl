import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getMailboxAdmin, teamMembers } from "@/server/queries/mail";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { MailboxStatus } from "@/features/mail/mailbox-settings";

export const metadata = { title: "Mailbox" };

export default function MailboxPage({ params }: PageProps<"/[ws]/settings/mailboxes/[id]">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={6} />}>
      <Mailbox params={params} />
    </Suspense>
  );
}

async function Mailbox({
  params,
}: {
  params: PageProps<"/[ws]/settings/mailboxes/[id]">["params"];
}) {
  const { ws, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireWorkspaceCtx(ws);
  const mailbox = await getMailboxAdmin(ctx, id).catch(() => null);
  if (!mailbox) notFound();
  return <MailboxStatus ws={ws} mailbox={mailbox} people={await teamMembers(ctx.workspace.id)} />;
}
