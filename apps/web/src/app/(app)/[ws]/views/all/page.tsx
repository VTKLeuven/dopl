import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DisplayOptionsSchema, defaultDisplayOptions } from "@dopl/shared/schemas/view";
import { parseFilter } from "@dopl/shared/schemas/filters";
import { db } from "@/server/db";
import { getWorkspaceMeta, listWorkspaceItems } from "@/server/queries/workspace-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { ProjectItemsView } from "@/features/work-items/project-items-view";

/** Every item across the projects the member can see; the unsaved workspace view. */
export default function AllItemsPage({ params, searchParams }: PageProps<"/[ws]/views/all">) {
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
      <AllItems params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AllItems({
  params,
  searchParams,
}: Pick<PageProps<"/[ws]/views/all">, "params" | "searchParams">) {
  const { ws } = await params;
  const { f } = await searchParams;
  const ctx = await requireWorkspaceCtx(ws);
  if (ctx.role === "GUEST") notFound();
  const pref = await db.viewPreference.findUnique({
    where: { userId_scope: { userId: ctx.actor.userId, scope: "workspace:all" } },
    select: { displayOptions: true, filters: true },
  });
  const parsed = DisplayOptionsSchema.safeParse(pref?.displayOptions ?? {});
  const options = parsed.success ? parsed.data : defaultDisplayOptions;
  const filters = parseFilter(typeof f === "string" ? safeJson(f) : (pref?.filters ?? {}));
  const [items, meta] = await Promise.all([
    listWorkspaceItems(ctx, { completed: options.completed, filters }),
    getWorkspaceMeta(ctx),
  ]);
  return (
    <ProjectItemsView
      ws={ws}
      scope={{ kind: "workspace" }}
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
