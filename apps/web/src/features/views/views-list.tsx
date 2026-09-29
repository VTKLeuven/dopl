"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  Columns3,
  GanttChart,
  Layers,
  LayoutList,
  Lock,
  Plus,
  Sheet,
  Users,
} from "lucide-react";
import { EMPTY_FILTER } from "@dopl/shared/schemas/filters";
import { defaultDisplayOptions, type DisplayOptions } from "@dopl/shared/schemas/view";
import type { ViewSummary } from "@/server/queries/views";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { PageHeader, type Crumb } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import { SaveViewDialog, viewHref } from "./save-view-dialog";
import { FavoriteButton } from "./view-controls";

const LAYOUT_ICON: Record<DisplayOptions["layout"], React.ReactNode> = {
  LIST: <LayoutList />,
  BOARD: <Columns3 />,
  TABLE: <Sheet />,
  CALENDAR: <CalendarDays />,
  TIMELINE: <GanttChart />,
};

/** Saved views of a project, or the workspace's cross-project views. */
export function ViewsList({
  ws,
  views,
  project,
  canCreate,
}: {
  ws: string;
  views: ViewSummary[];
  project: { id: string; identifier: string; name: string; color: string | null } | null;
  canCreate: boolean;
}) {
  const t = useTranslations("views");
  const ti = useTranslations("items");
  const relative = useRelativeTime();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const crumbs: Crumb[] = project
    ? [
        {
          label: project.name,
          icon: <ProjectBadge name={project.name} color={project.color} size={18} />,
          href: `/${ws}/p/${project.identifier}/items`,
        },
        { label: t("title") },
      ]
    : [{ label: t("workspaceTitle"), icon: <Layers /> }];
  const newButton = canCreate ? (
    <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-view">
      <Plus />
      {t("newView")}
    </Button>
  ) : null;

  return (
    <>
      <PageHeader crumbs={crumbs} actions={newButton} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {project === null && canCreate ? (
          <Link
            href={`/${ws}/views/all` as never}
            className="flex h-[var(--row-height)] items-center gap-3 border-b border-border px-5 focus-ring transition-colors hover:bg-surface-hover"
            data-testid="all-items"
          >
            <span className="flex size-7 items-center justify-center rounded-[8px] bg-sky-50 text-sky-700 [&_svg]:size-4">
              <Layers />
            </span>
            <span className="font-medium text-fg">{t("allItems")}</span>
            <span className="text-small text-fg-muted">{t("allItemsHint")}</span>
          </Link>
        ) : null}
        {views.length === 0 ? (
          <EmptyState
            icon={<Layers />}
            title={t("emptyTitle")}
            description={project ? t("emptyDescription") : t("emptyWorkspaceDescription")}
            action={newButton}
          />
        ) : (
          <ul className="divide-y divide-border border-b border-border" data-testid="views-list">
            {views.map((v) => {
              const href = viewHref(ws, v, project?.identifier ?? null);
              return (
                <li
                  key={v.id}
                  onClick={() => router.push(href as never)}
                  className="group flex h-[var(--row-height)] cursor-default items-center gap-3 px-5 transition-colors hover:bg-surface-hover"
                >
                  <span className="flex size-7 items-center justify-center rounded-[8px] bg-neutral-100 text-icon [&_svg]:size-4">
                    {LAYOUT_ICON[v.layout]}
                  </span>
                  <Link
                    href={href as never}
                    onClick={(e) => e.stopPropagation()}
                    className="flex min-w-0 flex-1 items-baseline gap-2 rounded-[6px] focus-ring"
                  >
                    <span className="truncate font-medium text-fg">{v.name}</span>
                    {v.description ? (
                      <span className="hidden truncate text-small text-fg-muted md:inline">
                        {v.description}
                      </span>
                    ) : null}
                  </Link>
                  <span className="hidden items-center gap-1.5 sm:flex">
                    {v.isLocked ? (
                      <Tooltip content={t("lockedBadge")}>
                        <Lock className="size-3.5 text-icon" />
                      </Tooltip>
                    ) : null}
                    <span className="inline-flex items-center gap-1 rounded-[6px] bg-neutral-100 px-1.5 py-0.5 text-caption font-medium text-fg-muted">
                      {v.visibility === "WORKSPACE" ? <Users className="size-3" /> : null}
                      {v.visibility === "WORKSPACE" ? t("sharedBadge") : t("privateBadge")}
                    </span>
                  </span>
                  <span className="hidden w-28 truncate text-small text-fg-muted lg:inline">
                    {ti(`layout.${v.layout}`)}
                  </span>
                  <span className="hidden items-center gap-2 text-small text-fg-secondary md:flex">
                    <Avatar user={v.owner} size="sm" />
                    <span className="w-28 truncate">{v.owner.name}</span>
                  </span>
                  <span className="hidden w-24 text-small text-fg-muted tabular lg:inline">
                    {relative(v.updatedAt)}
                  </span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <FavoriteButton ws={ws} viewId={v.id} initial={v.favorite} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {creating ? (
        <SaveViewDialog
          ws={ws}
          projectId={project?.id ?? null}
          projectIdentifier={project?.identifier ?? null}
          filters={EMPTY_FILTER}
          options={defaultDisplayOptions}
          open
          onOpenChange={(o) => !o && setCreating(false)}
        />
      ) : null}
    </>
  );
}
