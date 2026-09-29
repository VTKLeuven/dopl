import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/action-result";
import { getProjectAccess } from "@/server/queries/projects";
import { getView } from "@/server/queries/views";
import { getProjectMeta, listProjectItems } from "@/server/queries/work-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { ProjectItemsView } from "@/features/work-items/project-items-view";

export default function ProjectViewPage({ params }: PageProps<"/[ws]/p/[ident]/views/[viewId]">) {
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
      <ProjectView params={params} />
    </Suspense>
  );
}

async function ProjectView({
  params,
}: {
  params: PageProps<"/[ws]/p/[ident]/views/[viewId]">["params"];
}) {
  const { ws, ident, viewId } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const access = await getProjectAccess(ctx, ident);
  const view = await getView(ctx, viewId).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  if (view.projectId !== access.project.id) notFound();
  const [items, meta] = await Promise.all([
    listProjectItems(ctx, access, {
      completed: view.displayOptions.completed,
      filters: view.filters,
    }),
    getProjectMeta(ctx, access),
  ]);
  return (
    <ProjectItemsView
      // Remount when switching between views so state starts from the new one.
      key={view.id}
      ws={ws}
      scope={{ kind: "project", projectId: access.project.id }}
      initialItems={items}
      initialMeta={meta}
      initialOptions={view.displayOptions}
      initialFilters={view.filters}
      view={view}
    />
  );
}
