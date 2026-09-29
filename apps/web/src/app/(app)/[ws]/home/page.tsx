import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { House, CircleCheck } from "lucide-react";
import { format, parseISO } from "date-fns";
import { addDays, endOfWeek, startOfWeek, todayIn } from "@dopl/shared/domain/dates";
import { OPEN_GROUPS, formatIdentifier } from "@dopl/shared/schemas/work-item";
import { db } from "@/server/db";
import { getInboxSummary } from "@/server/queries/home";
import { getNotesSummary, listNotes, listTodos } from "@/server/queries/notes";
import { accessibleProjectsWhere } from "@/server/queries/projects";
import { fromDateOnly } from "@/server/services/work-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeader } from "@/components/shell/page-header";
import { PageHeaderSkeleton } from "@/components/shell/page-skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MyItems, type MyItem } from "./my-items";
import { HomeView } from "./home-widgets";

export const metadata = { title: "Home" };

export default function HomePage({ params }: PageProps<"/[ws]/home">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home params={params} />
    </Suspense>
  );
}

/** Same frame as the page: greeting, capture bar, week strip, two columns. */
function HomeSkeleton() {
  return (
    <>
      <PageHeaderSkeleton actions={0} />
      <div className="min-h-0 flex-1 overflow-hidden" aria-busy>
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-5 py-8 md:px-8">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-12 w-full rounded-card" />
          <Skeleton className="h-[112px] w-full rounded-card" />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-44 w-full rounded-card" />
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-44 w-full rounded-card" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

async function Home({ params }: { params: PageProps<"/[ws]/home">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const t = await getTranslations("home");
  const tw = await getTranslations("myWork");
  const today = todayIn(ctx.workspace.timezone);
  const weekStart = startOfWeek(today, ctx.workspace.weekStartsOn);
  const weekEnd = endOfWeek(today, ctx.workspace.weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [items, todos, notes, summary, inbox] = await Promise.all([
    db.workItem.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        deletedAt: null,
        archivedAt: null,
        stateGroup: { in: OPEN_GROUPS },
        assignees: { some: { userId: ctx.actor.userId } },
        project: accessibleProjectsWhere(ctx),
      },
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "asc" },
        { updatedAt: "desc" },
      ],
      take: 200,
      select: {
        id: true,
        sequence: true,
        title: true,
        priority: true,
        dueDate: true,
        stateGroup: true,
        state: { select: { name: true, color: true } },
        project: { select: { identifier: true, name: true, color: true } },
      },
    }),
    listTodos(ctx, "open", 50),
    listNotes(ctx, { filter: "recent", limit: 3 }),
    getNotesSummary(ctx),
    getInboxSummary(ctx),
  ]);

  const rows: MyItem[] = items.map((i) => {
    const due = fromDateOnly(i.dueDate);
    return {
      id: i.id,
      identifier: formatIdentifier(i.project.identifier, i.sequence),
      title: i.title,
      priority: i.priority,
      dueDate: due,
      stateGroup: i.stateGroup,
      stateColor: i.state.color,
      stateName: i.state.name,
      project: i.project,
      bucket: !due ? "noDue" : due < today ? "overdue" : due <= weekEnd ? "thisWeek" : "later",
    };
  });
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: ctx.workspace.timezone,
    }).format(new Date()),
  );
  const me = { id: ctx.actor.userId, name: ctx.actor.name, image: ctx.actor.image };

  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), icon: <House /> }]} />
      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-5 py-8 md:px-8">
          <div>
            <h1 className="text-display font-semibold" data-testid="home-greeting">
              {t("greeting", {
                part: t(hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"),
                name: ctx.actor.name.split(" ")[0] ?? ctx.actor.name,
              })}
            </h1>
            <p className="mt-1 text-body text-fg-muted">
              {format(parseISO(today), "EEEE d MMMM")} ·{" "}
              {t("assignedCount", { count: rows.length })}
              {summary.openTodos > 0 ? ` · ${tw("todoCount", { count: summary.openTodos })}` : ""}
            </p>
          </div>
          <HomeView
            ws={ws}
            me={me}
            days={days}
            today={today}
            items={rows}
            initialTodos={todos}
            initialNotes={notes}
            summary={summary}
            inbox={inbox}
            itemsSlot={<AssignedToMe ws={ws} rows={rows} />}
          />
        </div>
      </div>
    </>
  );
}

/** "Assigned to me", grouped by due date; rendered on the server into Home's left column. */
async function AssignedToMe({ ws, rows }: { ws: string; rows: MyItem[] }) {
  const t = await getTranslations("home");
  return (
    <section className="flex flex-col gap-2" data-testid="home-items">
      <h2 className="text-body font-semibold">{t("assigned")}</h2>
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={<CircleCheck />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <MyItems ws={ws} items={rows} />
      )}
    </section>
  );
}
