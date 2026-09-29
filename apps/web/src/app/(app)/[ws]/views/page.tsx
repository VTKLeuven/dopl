import { Suspense } from "react";
import { listViews } from "@/server/queries/views";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { ViewsList } from "@/features/views/views-list";

export default function WorkspaceViewsPage({ params }: PageProps<"/[ws]/views">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={1} />
          <RowsSkeleton rows={6} />
        </>
      }
    >
      <WorkspaceViews params={params} />
    </Suspense>
  );
}

async function WorkspaceViews({ params }: { params: PageProps<"/[ws]/views">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const views = ctx.role === "GUEST" ? [] : await listViews(ctx, null);
  return <ViewsList ws={ws} views={views} project={null} canCreate={ctx.role !== "GUEST"} />;
}
