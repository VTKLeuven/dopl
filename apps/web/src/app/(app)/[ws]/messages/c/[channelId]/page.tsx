import { Suspense } from "react";
import { notFound } from "next/navigation";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { z } from "zod";
import { NotFoundError } from "@/server/action-result";
import { getChannelDetail, listChannelMessages } from "@/server/queries/channels";
import { requireWorkspaceCtx } from "@/server/session";
import { chatKeys } from "@/features/messages/keys";
import { ChannelSkeleton, ChannelView } from "@/features/messages/channel-view";

export const metadata = { title: "Messages" };

export default function ChannelPage({ params }: PageProps<"/[ws]/messages/c/[channelId]">) {
  return (
    <Suspense fallback={<ChannelSkeleton />}>
      <Channel params={params} />
    </Suspense>
  );
}

async function Channel({
  params,
}: {
  params: PageProps<"/[ws]/messages/c/[channelId]">["params"];
}) {
  const { ws, channelId } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!z.uuid().safeParse(channelId).success) notFound();
  let detail;
  let page;
  try {
    [detail, page] = await Promise.all([
      getChannelDetail(ctx, channelId),
      listChannelMessages(ctx, channelId),
    ]);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const qc = new QueryClient();
  qc.setQueryData(chatKeys.channel(ws, channelId), detail);
  qc.setQueryData(chatKeys.messages(ws, channelId), { pages: [page], pageParams: [null] });
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ChannelView key={channelId} ws={ws} channelId={channelId} />
    </HydrationBoundary>
  );
}
