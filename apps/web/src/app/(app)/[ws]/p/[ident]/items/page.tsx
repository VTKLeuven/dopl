import { Suspense } from "react";
import { DisplayOptionsSchema, defaultDisplayOptions } from "@dopl/shared/schemas/view";
import { db } from "@/server/db";
import { getProjectAccess } from "@/server/queries/projects";
import { getProjectMeta, listProjectItems } from "@/server/queries/work-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { ProjectItemsView } from "@/features/work-items/project-items-view";

export default function ProjectItemsPage({ params }: PageProps<"/[ws]/p/[ident]/items">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={3} />
          <div className="h-[var(--toolbar-height)] border-b border-border" />
          <RowsSkeleton rows={12} />
        </>
      }
    >
      <ProjectItems params={params} />
    </Suspense>
  );
}

async function ProjectItems({ params }: { params: PageProps<"/[ws]/p/[ident]/items">["params"] }) {
  const { ws, ident } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const access = await getProjectAccess(ctx, ident);
  const pref = await db.viewPreference.findUnique({
    where: { userId_scope: { userId: ctx.actor.userId, scope: `project:${access.project.id}` } },
    select: { displayOptions: true },
  });
  const parsed = DisplayOptionsSchema.safeParse(pref?.displayOptions ?? {});
  const options = parsed.success ? parsed.data : defaultDisplayOptions;
  const [items, meta] = await Promise.all([
    listProjectItems(access, options.completed),
    getProjectMeta(ctx, access),
  ]);
  return (
    <ProjectItemsView
      ws={ws}
      projectId={access.project.id}
      initialItems={items}
      initialMeta={meta}
      initialOptions={options}
    />
  );
}
