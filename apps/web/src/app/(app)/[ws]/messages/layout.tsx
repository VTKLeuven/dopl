import { Suspense } from "react";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { listPeople, listSidebarChannels } from "@/server/queries/channels";
import { sidebarFolded } from "@/server/folded-sidebar";
import { requireWorkspaceCtx } from "@/server/session";
import { chatKeys } from "@/features/messages/keys";
import { ChannelSidebar } from "@/features/messages/channel-sidebar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Messages: a conversation list next to the open conversation. The list is
 * prefetched here so it paints with its unread state; it stays fresh via
 * realtime (channel and user events).
 */
export default function MessagesLayout({ children, params }: LayoutProps<"/[ws]/messages">) {
  return (
    <div className="flex min-h-0 flex-1">
      <Suspense fallback={<ColumnSkeleton />}>
        <Sidebar params={params} />
      </Suspense>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

async function Sidebar({ params }: { params: LayoutProps<"/[ws]/messages">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  // Team chat is for members (canChannel); guests have no Messages.
  if (ctx.role === "GUEST") notFound();
  const [channels, people, folded] = await Promise.all([
    listSidebarChannels(ctx),
    listPeople(ctx),
    sidebarFolded("messages"),
  ]);
  const qc = new QueryClient();
  qc.setQueryData(chatKeys.channels(ws), channels);
  qc.setQueryData(chatKeys.people(ws), people);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ChannelSidebar ws={ws} me={ctx.actor.userId} initialFolded={folded} />
    </HydrationBoundary>
  );
}

function ColumnSkeleton() {
  return (
    <div className="hidden w-[260px] shrink-0 flex-col border-r border-border md:flex" aria-hidden>
      <div className="flex h-[var(--header-height)] items-center border-b border-border px-4">
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className="flex flex-col gap-2 px-4 pt-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${45 + ((i * 17) % 40)}%` }} />
        ))}
      </div>
    </div>
  );
}
