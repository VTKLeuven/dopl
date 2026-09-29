import { Suspense } from "react";
import { DisplayOptionsSchema, defaultDisplayOptions } from "@dopl/shared/schemas/view";
import { parseFilter } from "@dopl/shared/schemas/filters";
import { db } from "@/server/db";
import { getProjectAccess } from "@/server/queries/projects";
import { getProjectMeta, listProjectItems } from "@/server/queries/work-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { ProjectItemsView } from "@/features/work-items/project-items-view";

export default function ProjectItemsPage({
  params,
  searchParams,
}: PageProps<"/[ws]/p/[ident]/items">) {
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
      <ProjectItems params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectItems({
  params,
  searchParams,
}: Pick<PageProps<"/[ws]/p/[ident]/items">, "params" | "searchParams">) {
  const { ws, ident } = await params;
  const { f } = await searchParams;
  const ctx = await requireWorkspaceCtx(ws);
  const access = await getProjectAccess(ctx, ident);
  const pref = await db.viewPreference.findUnique({
    where: { userId_scope: { userId: ctx.actor.userId, scope: `project:${access.project.id}` } },
    select: { displayOptions: true, filters: true },
  });
  const parsed = DisplayOptionsSchema.safeParse(pref?.displayOptions ?? {});
  const options = parsed.success ? parsed.data : defaultDisplayOptions;
  // A shared link's filter wins over the user's last-used one.
  const filters = parseFilter(typeof f === "string" ? safeJson(f) : (pref?.filters ?? {}));
  const [items, meta] = await Promise.all([
    listProjectItems(ctx, access, { completed: options.completed, filters }),
    getProjectMeta(ctx, access),
  ]);
  return (
    <ProjectItemsView
      ws={ws}
      projectId={access.project.id}
      initialItems={items}
      initialMeta={meta}
      initialOptions={options}
      initialFilters={filters}
    />
  );
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
