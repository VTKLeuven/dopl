import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { BuiltInDashboard } from "@/features/analytics/dashboard-view";
import { DashboardSkeleton } from "./dashboard-skeleton";

export const metadata = { title: "Analytics" };

export default function AnalyticsPage({ params }: PageProps<"/[ws]/analytics">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: Pick<PageProps<"/[ws]/analytics">, "params">) {
  const { ws } = await params;
  const t = await getTranslations("analytics");
  return <BuiltInDashboard ws={ws} projectId={null} title={t("overview")} />;
}
