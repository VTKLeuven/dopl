import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BarChart3 } from "lucide-react";
import { canWorkspace } from "@dopl/shared/policy";
import { getProjectAccess } from "@/server/queries/projects";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeader } from "@/components/shell/page-header";
import { PageHeaderSkeleton } from "@/components/shell/page-skeletons";
import { ProjectBadge } from "@/components/shell/project-badge";
import { BuiltInDashboard } from "@/features/analytics/dashboard-view";
import { DashboardSkeleton } from "../../../analytics/dashboard-skeleton";

export const metadata = { title: "Project analytics" };

export default function ProjectAnalyticsPage({ params }: PageProps<"/[ws]/p/[ident]/analytics">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={0} />
          <div className="mx-auto w-full max-w-[1320px] px-4 py-5 md:px-6">
            <DashboardSkeleton />
          </div>
        </>
      }
    >
      <ProjectAnalytics params={params} />
    </Suspense>
  );
}

async function ProjectAnalytics({
  params,
}: Pick<PageProps<"/[ws]/p/[ident]/analytics">, "params">) {
  const { ws, ident } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "analytics.view")) notFound();
  const access = await getProjectAccess(ctx, ident);
  const t = await getTranslations("analytics");
  const p = access.project;
  return (
    <>
      <PageHeader
        crumbs={[
          {
            label: p.name,
            icon: <ProjectBadge name={p.name} color={p.color} />,
            href: `/${ws}/p/${p.identifier}/items`,
          },
          { label: t("title"), icon: <BarChart3 /> },
        ]}
      />
      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        <div className="mx-auto w-full max-w-[1320px] px-4 py-5 md:px-6">
          <BuiltInDashboard
            ws={ws}
            projectId={p.id}
            title={t("projectOverview", { project: p.name })}
          />
        </div>
      </div>
    </>
  );
}
