"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BarChart3, LayoutDashboard, Plus, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, type Crumb } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import { useDashboardMutations, useDashboards } from "./data";
import type { DashboardSummary } from "./types";

const rowClasses = (active: boolean) =>
  cn(
    "group/row flex h-8 w-full min-w-0 items-center gap-2 rounded-control px-2.5 text-left text-body font-medium text-fg-secondary focus-ring",
    "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-icon",
    active ? "bg-neutral-150 text-fg [&>svg]:text-icon-strong" : "hover:bg-surface-hover",
  );

function DashboardRow({ ws, d, active }: { ws: string; d: DashboardSummary; active: boolean }) {
  return (
    <Link
      href={`/${ws}/analytics/${d.id}` as never}
      className={rowClasses(active)}
      aria-current={active ? "page" : undefined}
      data-testid="dashboard-link"
    >
      {d.project ? (
        <ProjectBadge name={d.project.name} color={d.project.color} size={16} />
      ) : (
        <LayoutDashboard />
      )}
      <span className="truncate">{d.name}</span>
    </Link>
  );
}

/** Analytics' secondary column: the overview, your dashboards, and shared ones. */
export function AnalyticsSidebar({
  ws,
  me,
  initial,
}: {
  ws: string;
  me: string;
  initial: DashboardSummary[];
}) {
  const t = useTranslations("analytics");
  const pathname = usePathname();
  const { data: dashboards = initial } = useDashboards(ws, initial);
  const mine = dashboards.filter((d) => d.owner.id === me);
  const shared = dashboards.filter((d) => d.owner.id !== me);
  const overview = pathname === `/${ws}/analytics`;
  return (
    <nav
      aria-label={t("title")}
      data-testid="analytics-sidebar"
      className="hidden w-60 shrink-0 scrollbar-thin flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4 md:flex"
    >
      <Link
        href={`/${ws}/analytics` as never}
        className={rowClasses(overview)}
        aria-current={overview ? "page" : undefined}
      >
        <BarChart3 />
        <span className="truncate">{t("overview")}</span>
        <span className="ml-auto text-caption text-fg-muted">{t("builtIn")}</span>
      </Link>

      <p className="mt-5 mb-1 flex h-6 items-center px-2.5 text-caption font-medium text-fg-muted">
        {t("yours")}
      </p>
      {mine.length === 0 ? (
        <p className="px-2.5 py-1 text-small text-fg-muted">{t("noDashboards")}</p>
      ) : (
        mine.map((d) => (
          <DashboardRow key={d.id} ws={ws} d={d} active={pathname === `/${ws}/analytics/${d.id}`} />
        ))
      )}

      {shared.length > 0 ? (
        <>
          <p className="mt-5 mb-1 flex h-6 items-center gap-1.5 px-2.5 text-caption font-medium text-fg-muted">
            <Users className="size-3.5" />
            {t("shared")}
          </p>
          {shared.map((d) => (
            <DashboardRow
              key={d.id}
              ws={ws}
              d={d}
              active={pathname === `/${ws}/analytics/${d.id}`}
            />
          ))}
        </>
      ) : null}
    </nav>
  );
}

export function AnalyticsSidebarSkeleton() {
  return (
    <div
      aria-hidden
      className="hidden w-60 shrink-0 flex-col gap-2 border-r border-border px-5 py-5 md:flex"
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="mt-6 h-3 w-24" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/** Phones: the dashboards as a row of chips above the page. */
export function AnalyticsChips({ ws, initial }: { ws: string; initial: DashboardSummary[] }) {
  const t = useTranslations("analytics");
  const pathname = usePathname();
  const { data: dashboards = initial } = useDashboards(ws, initial);
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip border px-2.5 text-body focus-ring",
      active
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-border bg-surface text-fg-secondary",
    );
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
      <Link href={`/${ws}/analytics` as never} className={chip(pathname === `/${ws}/analytics`)}>
        {t("overview")}
      </Link>
      {dashboards.map((d) => (
        <Link
          key={d.id}
          href={`/${ws}/analytics/${d.id}` as never}
          className={chip(pathname === `/${ws}/analytics/${d.id}`)}
        >
          {d.name}
        </Link>
      ))}
    </div>
  );
}

/** Header: breadcrumb, and "New dashboard" as the one primary action. */
export function AnalyticsHeader({ ws, initial }: { ws: string; initial: DashboardSummary[] }) {
  const t = useTranslations("analytics");
  const router = useRouter();
  const pathname = usePathname();
  const { create } = useDashboardMutations(ws);
  const { data: dashboards = initial } = useDashboards(ws, initial);
  const current = dashboards.find((d) => pathname === `/${ws}/analytics/${d.id}`);
  const crumbs: Crumb[] = [{ label: t("title"), icon: <BarChart3 />, href: `/${ws}/analytics` }];
  crumbs.push({ label: current?.name ?? t("overview") });
  return (
    <PageHeader
      crumbs={crumbs}
      actions={
        <Button
          variant="primary"
          loading={create.isPending}
          data-testid="new-dashboard"
          onClick={() =>
            create.mutate(
              { name: t("newDashboardName") },
              { onSuccess: ({ id }) => router.push(`/${ws}/analytics/${id}` as never) },
            )
          }
        >
          <Plus />
          <span className="hidden sm:inline">{t("newDashboard")}</span>
        </Button>
      }
    />
  );
}
