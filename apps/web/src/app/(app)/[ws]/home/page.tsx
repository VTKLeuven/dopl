import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { House, CircleCheck } from "lucide-react";
import { endOfWeek, startOfDay } from "date-fns";
import { OPEN_GROUPS, formatIdentifier } from "@dopl/shared/schemas/work-item";
import { db } from "@/server/db";
import { accessibleProjectsWhere } from "@/server/queries/projects";
import { fromDateOnly } from "@/server/services/work-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeader } from "@/components/shell/page-header";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { MyItems, type MyItem } from "./my-items";

export const metadata = { title: "Home" };

export default function HomePage({ params }: PageProps<"/[ws]/home">) {
  return (
    <Suspense fallback={<><PageHeaderSkeleton actions={0} /><RowsSkeleton rows={8} /></>}>
      <Home params={params} />
    </Suspense>
  );
}

async function Home({ params }: { params: PageProps<"/[ws]/home">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const t = await getTranslations("home");
  const items = await db.workItem.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      deletedAt: null,
      archivedAt: null,
      stateGroup: { in: OPEN_GROUPS },
      assignees: { some: { userId: ctx.actor.userId } },
      project: accessibleProjectsWhere(ctx),
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: {
      id: true, sequence: true, title: true, priority: true, dueDate: true, stateGroup: true,
      state: { select: { name: true, color: true } },
      project: { select: { identifier: true, name: true, color: true } },
    },
  });
  const today = startOfDay(new Date());
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const rows: MyItem[] = items.map((i) => ({
    id: i.id,
    identifier: formatIdentifier(i.project.identifier, i.sequence),
    title: i.title,
    priority: i.priority,
    dueDate: fromDateOnly(i.dueDate),
    stateGroup: i.stateGroup,
    stateColor: i.state.color,
    stateName: i.state.name,
    project: i.project,
    bucket: !i.dueDate ? "noDue" : i.dueDate < today ? "overdue" : i.dueDate <= weekEnd ? "thisWeek" : "later",
  }));
  const hour = new Date().getHours();
  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), icon: <House /> }]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-5 py-8 md:px-8">
          <h1 className="text-display font-semibold" data-testid="home-greeting">
            {t("greeting", { part: t(hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"), name: ctx.actor.name.split(" ")[0] ?? ctx.actor.name })}
          </h1>
          <p className="mt-1 text-body text-fg-muted">{t("assignedCount", { count: rows.length })}</p>
          {rows.length === 0 ? (
            <EmptyState icon={<CircleCheck />} title={t("emptyTitle")} description={t("emptyDescription")} />
          ) : (
            <MyItems ws={ws} items={rows} />
          )}
        </div>
      </div>
    </>
  );
}
