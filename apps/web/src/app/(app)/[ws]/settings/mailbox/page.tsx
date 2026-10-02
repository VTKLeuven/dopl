import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canMailbox } from "@dopl/shared/policy";
import { getPersonalMailbox } from "@/server/queries/mail";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { PersonalMailbox } from "@/features/mail/mailbox-settings";

export const metadata = { title: "My mailbox" };

/** Settings → My mailbox (D-138): your own work mailbox, which only you see. */
export default function MyMailboxPage({ params }: PageProps<"/[ws]/settings/mailbox">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={4} />}>
      <MyMailbox params={params} />
    </Suspense>
  );
}

async function MyMailbox({ params }: { params: PageProps<"/[ws]/settings/mailbox">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const own = { isMember: false, ownerId: ctx.actor.userId };
  if (!canMailbox(ctx.policyActor, own, "mailbox.manage")) notFound();
  return (
    <PersonalMailbox ws={ws} email={ctx.actor.email} mailbox={await getPersonalMailbox(ctx)} />
  );
}
