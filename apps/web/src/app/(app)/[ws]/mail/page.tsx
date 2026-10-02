import { Suspense } from "react";
import { canMailbox } from "@dopl/shared/policy";
import { listMailboxes, listThreads } from "@/server/queries/mail";
import { sidebarFolded } from "@/server/folded-sidebar";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton } from "@/components/shell/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { MailView } from "@/features/mail/mail-view";

export const metadata = { title: "Mail" };

export default function MailPage({ params }: PageProps<"/[ws]/mail">) {
  return (
    <Suspense fallback={<MailSkeleton />}>
      <Mail params={params} />
    </Suspense>
  );
}

/** Same frame as the page: header, views column, list, reader. */
function MailSkeleton() {
  return (
    <>
      <PageHeaderSkeleton actions={1} />
      <div className="flex min-h-0 flex-1" aria-busy>
        <div className="hidden w-56 shrink-0 flex-col gap-2 border-r border-border px-5 py-5 lg:flex">
          {[70, 50, 60, 55, 45, 40].map((w, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="flex w-full flex-col gap-3 p-4 md:w-[380px] md:border-r md:border-border">
          <Skeleton className="h-8 w-full rounded-chip" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-card" />
          ))}
        </div>
      </div>
    </>
  );
}

async function Mail({ params }: Pick<PageProps<"/[ws]/mail">, "params">) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const [mailboxes, page, folded] = await Promise.all([
    listMailboxes(ctx),
    listThreads(ctx, { view: "open" }),
    sidebarFolded("mail"),
  ]);
  return (
    <MailView
      ws={ws}
      me={ctx.actor.userId}
      isAdmin={canMailbox(ctx.policyActor, { isMember: false }, "mailbox.manage")}
      initialMailboxes={mailboxes}
      initialPage={page}
      initialFolded={folded}
    />
  );
}
