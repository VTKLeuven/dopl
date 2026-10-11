import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { format, parseISO } from "date-fns";
import { addDays, endOfWeek, startOfWeek, todayIn } from "@dopl/shared/domain/dates";
import { hasWidget } from "@dopl/shared/domain/home";
import { canWorkspace } from "@dopl/shared/policy";
import { OPEN_GROUPS, formatIdentifier } from "@dopl/shared/schemas/work-item";
import { db } from "@/server/db";
import { getHomeLayout, getInboxSummary } from "@/server/queries/home";
import { readableMailboxIds } from "@/server/queries/mail";
import { getNotesSummary, listNotes, listTodos } from "@/server/queries/notes";
import { accessibleProjectsWhere } from "@/server/queries/projects";
import { fromDateOnly } from "@/server/services/work-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton } from "@/components/shell/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { PINNED_NOTES_LIMIT } from "@/features/home/catalog";
import { HomeView } from "@/features/home/home-view";
import type { MyItem } from "@/features/home/my-items";
import type { ListParams } from "@/features/notes/data";

export const metadata = { title: "Home" };

export default function HomePage({ params }: PageProps<"/[ws]/home">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home params={params} />
    </Suspense>
  );
}

/** The default layout's frame: greeting, capture bar, notes on the left, panels on the right. */
function HomeSkeleton() {
  return (
    <>
      <PageHeaderSkeleton actions={1} />
      <div className="min-h-0 flex-1 overflow-hidden" aria-busy>
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-5 py-8 md:px-8">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-12 w-full rounded-card" />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-28" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-36 w-full rounded-card" />
                <Skeleton className="h-28 w-full rounded-card" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-28 w-full rounded-card" />
              <Skeleton className="h-14 w-full rounded-card" />
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

  const [{ layout, custom }, items, todos, summary, inbox, mailboxes] = await Promise.all([
    getHomeLayout(ctx),
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
    getNotesSummary(ctx),
    getInboxSummary(ctx),
    readableMailboxIds(ctx),
  ]);

  // Preload the note lists on the page, with exactly the params their widgets ask for.
  const hasPinned = hasWidget(layout, "pinnedNotes");
  const recent = layout.widgets.find((w) => w.type === "recentNotes");
  const wanted: ListParams[] = [
    ...(hasPinned ? [{ filter: "pinned" as const, limit: PINNED_NOTES_LIMIT }] : []),
    ...(recent ? [{ filter: "recent" as const, limit: recent.count, unpinned: hasPinned }] : []),
  ];
  const notes = await Promise.all(
    wanted.map(async (p) => ({
      params: p,
      cards: await listNotes(ctx, {
        filter: p.filter,
        limit: p.limit ?? PINNED_NOTES_LIMIT,
        ...(p.unpinned ? { unpinned: true as const } : {}),
      }),
    })),
  );

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

  const greeting = (
    <div>
      <h1 className="text-display font-semibold" data-testid="home-greeting">
        {t("greeting", {
          part: t(hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"),
          name: ctx.actor.name.split(" ")[0] ?? ctx.actor.name,
        })}
      </h1>
      <p className="mt-1 text-body text-fg-muted">
        {format(parseISO(today), "EEEE d MMMM")} · {t("assignedCount", { count: rows.length })}
        {summary.openTodos > 0 ? ` · ${tw("todoCount", { count: summary.openTodos })}` : ""}
      </p>
    </div>
  );

  return (
    <HomeView
      greeting={greeting}
      initialLayout={{ layout, custom }}
      caps={{
        mail: mailboxes.length > 0,
        analytics: canWorkspace(ctx.policyActor, "analytics.view"),
        views: ctx.role !== "GUEST",
      }}
      data={{
        ws,
        me: { id: ctx.actor.userId, name: ctx.actor.name, image: ctx.actor.image },
        today,
        weekEnd,
        days,
        items: rows,
        inbox,
        summary,
        todos,
        notes,
      }}
    />
  );
}
