import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canMailbox } from "@dopl/shared/policy";
import { listMailboxesForAdmin, teamMembers } from "@/server/queries/mail";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { MailboxesSettings } from "@/features/mail/mailbox-settings";

export const metadata = { title: "Mailboxes" };

export default function MailboxesPage({ params }: PageProps<"/[ws]/settings/mailboxes">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={4} />}>
      <Mailboxes params={params} />
    </Suspense>
  );
}

async function Mailboxes({ params }: { params: PageProps<"/[ws]/settings/mailboxes">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canMailbox(ctx.policyActor, { isMember: false }, "mailbox.manage")) notFound();
  const [mailboxes, people] = await Promise.all([
    listMailboxesForAdmin(ctx),
    teamMembers(ctx.workspace.id),
  ]);
  return (
    <MailboxesSettings
      ws={ws}
      mailboxes={mailboxes.map((m) => ({
        id: m.id,
        emailAddress: m.emailAddress,
        displayName: m.displayName,
        status: m.status,
        lastSyncedAt: m.lastSyncedAt?.toISOString() ?? null,
        syncError: m.syncError,
        members: m._count.members,
        threads: m._count.threads,
      }))}
      people={people}
    />
  );
}
