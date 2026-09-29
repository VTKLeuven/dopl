import { Suspense } from "react";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { InboxQuerySchema } from "@dopl/shared/schemas/inbox";
import { inboxCounts, listNotifications } from "@/server/queries/inbox";
import { requireWorkspaceCtx } from "@/server/session";
import { inboxKeys } from "@/features/inbox/keys";
import { InboxSkeleton, InboxView } from "@/features/inbox/inbox-view";

export const metadata = { title: "Inbox" };

export default function InboxPage({ params, searchParams }: PageProps<"/[ws]/inbox">) {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <Inbox params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Inbox({
  params,
  searchParams,
}: Pick<PageProps<"/[ws]/inbox">, "params" | "searchParams">) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspaceCtx(ws);
  const q = InboxQuerySchema.parse({
    view: typeof sp.view === "string" ? sp.view : "all",
    filter: typeof sp.type === "string" ? sp.type : null,
    cursor: null,
  });
  const [page, counts] = await Promise.all([listNotifications(ctx, q), inboxCounts(ctx)]);
  const qc = new QueryClient();
  qc.setQueryData(inboxKeys.list(ws, q.view, q.filter), { pages: [page], pageParams: [null] });
  qc.setQueryData(inboxKeys.counts(ws), counts);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <InboxView ws={ws} />
    </HydrationBoundary>
  );
}
