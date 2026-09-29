import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDashboard } from "@/server/queries/dashboards";
import { requireWorkspaceCtx } from "@/server/session";
import { CustomDashboard } from "@/features/analytics/dashboard-view";
import { DashboardSkeleton } from "../dashboard-skeleton";

export const metadata = { title: "Dashboard" };

export default function DashboardPage({ params }: PageProps<"/[ws]/analytics/[dashboardId]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard params={params} />
    </Suspense>
  );
}

async function Dashboard({ params }: Pick<PageProps<"/[ws]/analytics/[dashboardId]">, "params">) {
  const { ws, dashboardId } = await params;
  if (!z.uuid().safeParse(dashboardId).success) notFound();
  const ctx = await requireWorkspaceCtx(ws);
  // Someone else's private dashboard looks like a missing one.
  const dashboard = await getDashboard(ctx, dashboardId).catch(() => null);
  if (!dashboard) notFound();
  return <CustomDashboard ws={ws} id={dashboardId} initial={dashboard} />;
}
