import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/action-result";
import { getView } from "@/server/queries/views";
import { getWorkspaceMeta, listWorkspaceItems } from "@/server/queries/workspace-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { ProjectItemsView } from "@/features/work-items/project-items-view";

export default function WorkspaceViewPage({ params }: PageProps<"/[ws]/views/[viewId]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={4} />
          <div className="h-[var(--toolbar-height)] border-b border-border" />
          <RowsSkeleton rows={12} />
        </>
      }
    >
      <WorkspaceView params={params} />
    </Suspense>
  );
}

async function WorkspaceView({ params }: { params: PageProps<"/[ws]/views/[viewId]">["params"] }) {
  const { ws, viewId } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (ctx.role === "GUEST") notFound();
  const view = await getView(ctx, viewId).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  if (view.projectId !== null) notFound();
  const [items, meta] = await Promise.all([
    listWorkspaceItems(ctx, { completed: view.displayOptions.completed, filters: view.filters }),
    getWorkspaceMeta(ctx),
  ]);
  return (
    <ProjectItemsView
      key={view.id}
      ws={ws}
      scope={{ kind: "workspace" }}
      initialItems={items}
      initialMeta={meta}
      initialOptions={view.displayOptions}
      initialFilters={view.filters}
      view={view}
    />
  );
}
