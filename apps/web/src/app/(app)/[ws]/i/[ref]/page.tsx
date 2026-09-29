import { Suspense } from "react";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/action-result";
import { projectAccessById } from "@/server/queries/projects";
import { getProjectMeta, getWorkItemDetail } from "@/server/queries/work-items";
import { requireWorkspaceCtx } from "@/server/session";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemPage } from "./item-page";

export default function WorkItemPage({ params }: PageProps<"/[ws]/i/[ref]">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-8">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      }
    >
      <Item params={params} />
    </Suspense>
  );
}

async function Item({ params }: { params: PageProps<"/[ws]/i/[ref]">["params"] }) {
  const { ws, ref } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  let detail;
  try {
    detail = await getWorkItemDetail(ctx, decodeURIComponent(ref));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const meta = await getProjectMeta(ctx, await projectAccessById(ctx, detail.projectId));
  const qc = new QueryClient();
  qc.setQueryData(["item", detail.identifier.toUpperCase()], detail);
  qc.setQueryData(["meta", detail.projectId], meta);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <ItemPage ws={ws} itemRef={detail.identifier} />
    </HydrationBoundary>
  );
}
