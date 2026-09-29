import { Suspense } from "react";
import { getProjectAccess } from "@/server/queries/projects";
import { listViews } from "@/server/queries/views";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { ViewsList } from "@/features/views/views-list";

export default function ProjectViewsPage({ params }: PageProps<"/[ws]/p/[ident]/views">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={1} />
          <RowsSkeleton rows={6} />
        </>
      }
    >
      <ProjectViews params={params} />
    </Suspense>
  );
}

async function ProjectViews({ params }: { params: PageProps<"/[ws]/p/[ident]/views">["params"] }) {
  const { ws, ident } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const access = await getProjectAccess(ctx, ident);
  const views = await listViews(ctx, access.project.id);
  return (
    <ViewsList
      ws={ws}
      views={views}
      project={{
        id: access.project.id,
        identifier: access.project.identifier,
        name: access.project.name,
        color: access.project.color,
      }}
      canCreate={ctx.role !== "GUEST"}
    />
  );
}
