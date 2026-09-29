import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { listDashboards } from "@/server/queries/dashboards";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton } from "@/components/shell/page-skeletons";
import {
  AnalyticsChips,
  AnalyticsHeader,
  AnalyticsSidebar,
  AnalyticsSidebarSkeleton,
} from "@/features/analytics/analytics-nav";

/**
 * Analytics (ROADMAP §Phase 6): the header, a column with the overview and
 * the dashboards, and the page. Guests have no analytics.
 */
export default function AnalyticsLayout({ children, params }: LayoutProps<"/[ws]/analytics">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={1} />
          <div className="flex min-h-0 flex-1">
            <AnalyticsSidebarSkeleton />
          </div>
        </>
      }
    >
      <Shell params={params}>{children}</Shell>
    </Suspense>
  );
}

async function Shell({
  params,
  children,
}: {
  params: LayoutProps<"/[ws]/analytics">["params"];
  children: React.ReactNode;
}) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "analytics.view")) notFound();
  const dashboards = await listDashboards(ctx);
  return (
    <>
      <AnalyticsHeader ws={ws} initial={dashboards} />
      <div className="flex min-h-0 flex-1">
        <AnalyticsSidebar ws={ws} me={ctx.actor.userId} initial={dashboards} />
        <div className="min-h-0 min-w-0 flex-1 scrollbar-thin overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 px-4 py-5 md:px-6">
            <AnalyticsChips ws={ws} initial={dashboards} />
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
