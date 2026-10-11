"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { format, parseISO } from "date-fns";
import { ArrowRight, BarChart3, Bell, CircleCheck, ListChecks, RotateCcw } from "lucide-react";
import { isEmptyChart } from "@dopl/shared/domain/analytics";
import { homeChart, todayAgenda, type AgendaWhen } from "@dopl/shared/domain/home";
import type { HomeWidget, HomeWidgetOf } from "@dopl/shared/schemas/home";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StateIcon } from "@/components/icons/state-icon";
import { PriorityIcon } from "@/components/icons/priority-icon";
import { ChartView, PLOT_HEIGHT } from "@/features/analytics/chart";
import { useMetric } from "@/features/analytics/data";
import { WidgetSkeleton } from "@/features/analytics/widget-card";
import { useThreads } from "@/features/mail/data";
import type { Me } from "@/features/notes/capture";
import type { ConvertTarget } from "@/features/notes/convert-dialog";
import {
  useNotes,
  useNotesSummary,
  useToggleTodo,
  useTodos,
  type ListParams,
} from "@/features/notes/data";
import { NoteCardView } from "@/features/notes/note-card";
import { TodoLine } from "@/features/notes/todos-view";
import type { NoteCard, NotesSummary, TodoRow } from "@/features/notes/types";
import type { InboxSummary } from "@/server/queries/home";
import { PINNED_NOTES_LIMIT, WIDGET_ICONS } from "./catalog";
import { isNotFound, useViewPreview } from "./data";
import { MyItems, type MyItem } from "./my-items";

/* ───────────────────────── page data and edit chrome ───────────────────────── */

/** Server-rendered data the widgets share, plus the page's dialogs. */
export interface HomeData {
  ws: string;
  me: Me;
  today: string;
  weekEnd: string;
  days: string[];
  items: MyItem[];
  inbox: InboxSummary;
  summary: NotesSummary;
  todos: TodoRow[];
  /** Note lists the server already loaded, with the params they were loaded for. */
  notes: Array<{ params: ListParams; cards: NoteCard[] }>;
  /** Recent notes leave pinned ones out while a pinned widget is on the page. */
  hasPinned: boolean;
  openNote: (id: string) => void;
  convert: (target: ConvertTarget) => void;
}

const HomeDataContext = createContext<HomeData | null>(null);
export const HomeDataProvider = HomeDataContext.Provider;

function useHome(): HomeData {
  const data = useContext(HomeDataContext);
  if (!data) throw new Error("Home widgets need HomeDataProvider");
  return data;
}

/** Set while customizing: the drag handle and menu a widget's header shows. */
export interface EditChrome {
  handle: React.ReactNode;
  menu: React.ReactNode;
}
const EditContext = createContext<EditChrome | null>(null);
export const EditChromeProvider = EditContext.Provider;

const same = (a: ListParams, b: ListParams) =>
  a.filter === b.filter &&
  (a.tag ?? null) === (b.tag ?? null) &&
  (a.limit ?? null) === (b.limit ?? null) &&
  Boolean(a.unpinned) === Boolean(b.unpinned);

/** Notes for a widget, seeded from the server when it loaded the same list. */
function useWidgetNotes(params: ListParams) {
  const { ws, notes } = useHome();
  const initial = notes.find((n) => same(n.params, params))?.cards;
  return useNotes(ws, params, initial);
}

/* ───────────────────────── shared bits ───────────────────────── */

/**
 * Every widget's frame: icon, title, count and one link. While customizing it
 * gets a dashed outline, a drag handle and a menu, and its content is shown
 * inert and clipped so the page stays easy to rearrange.
 */
function WidgetFrame({
  widget,
  title,
  count,
  action,
  bare = false,
  children,
}: {
  widget: HomeWidget;
  title: React.ReactNode;
  count?: React.ReactNode;
  action?: React.ReactNode;
  /** No header outside edit mode (the content carries its own title). */
  bare?: boolean;
  children: React.ReactNode;
}) {
  const edit = useContext(EditContext);
  const Icon = WIDGET_ICONS[widget.type];
  return (
    <section
      data-testid={`widget-${widget.type}`}
      data-widget-id={widget.id}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "@container flex min-w-0 flex-col gap-2",
        edit &&
          "rounded-card border border-dashed border-sky-300 bg-surface p-3 transition-shadow duration-[var(--dur-fast)]",
      )}
    >
      {edit || !bare ? (
        <div className="flex h-7 min-w-0 items-center gap-2">
          {edit?.handle}
          <Icon className="size-4 shrink-0 text-icon" aria-hidden />
          <h2 className="min-w-0 truncate text-body font-semibold">{title}</h2>
          {count !== undefined && count !== null ? (
            <span className="shrink-0 text-small text-fg-muted tabular">{count}</span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {edit ? edit.menu : action}
          </div>
        </div>
      ) : null}
      {edit ? (
        <div inert className="relative max-h-72 overflow-hidden">
          {children}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-b from-transparent to-surface"
          />
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href as never}
      className="inline-flex items-center gap-1 rounded-[6px] text-small font-medium text-fg-muted focus-ring hover:text-fg"
    >
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border border-dashed border-border-strong px-4 py-3.5 text-small text-fg-muted">
      {children}
    </p>
  );
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-border" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex h-11 items-center gap-2.5 border-b border-border px-4 last:border-0"
        >
          <Skeleton className="size-3.5 rounded-full" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 flex-1" />
        </div>
      ))}
    </div>
  );
}

function WidgetError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("home.widget");
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-border px-4 py-3">
      <p className="text-small text-fg-muted">{t("error")}</p>
      <Button variant="secondary" size="xs" onClick={onRetry}>
        <RotateCcw />
        {t("retry")}
      </Button>
    </div>
  );
}

/* ───────────────────────── notes ───────────────────────── */

/** Masonry via CSS columns, like the notes grid: one column on the side, more as it widens. */
function NotesMasonry({ cards }: { cards: NoteCard[] }) {
  const { ws, me, openNote } = useHome();
  return (
    <div className="columns-[280px] gap-3">
      {cards.map((c) => (
        <NoteCardView key={c.id} ws={ws} me={me} card={c} onOpen={openNote} />
      ))}
    </div>
  );
}

function NotesSkeleton() {
  return (
    <div className="columns-[280px] gap-3" aria-busy>
      {[120, 88, 140, 96].map((h, i) => (
        <div
          key={i}
          className="mb-3 flex break-inside-avoid flex-col gap-2.5 rounded-card border border-border bg-surface p-4"
          style={{ height: h }}
        >
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="mt-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function NotesBody({
  query,
  limit,
  empty,
}: {
  query: ReturnType<typeof useNotes>;
  limit?: number;
  empty: React.ReactNode;
}) {
  const { data, isPending, isError, refetch } = query;
  if (isPending) return <NotesSkeleton />;
  if (isError && !data) return <WidgetError onRetry={() => void refetch()} />;
  const cards = limit ? (data ?? []).slice(0, limit) : (data ?? []);
  return cards.length === 0 ? <Quiet>{empty}</Quiet> : <NotesMasonry cards={cards} />;
}

function PinnedNotesWidget({ widget }: { widget: HomeWidgetOf<"pinnedNotes"> }) {
  const t = useTranslations("home.widgets.pinnedNotes");
  const { ws } = useHome();
  const query = useWidgetNotes({ filter: "pinned", limit: PINNED_NOTES_LIMIT });
  return (
    <WidgetFrame
      widget={widget}
      title={t("title")}
      count={query.data?.length || undefined}
      action={<PanelLink href={`/${ws}/notes?filter=pinned`}>{t("link")}</PanelLink>}
    >
      <NotesBody query={query} empty={t("empty")} />
    </WidgetFrame>
  );
}

function RecentNotesWidget({ widget }: { widget: HomeWidgetOf<"recentNotes"> }) {
  const t = useTranslations("home.widgets.recentNotes");
  const { ws, hasPinned } = useHome();
  const query = useWidgetNotes({ filter: "recent", limit: widget.count, unpinned: hasPinned });
  return (
    <WidgetFrame
      widget={widget}
      title={t("title")}
      action={<PanelLink href={`/${ws}/notes`}>{t("link")}</PanelLink>}
    >
      <NotesBody query={query} limit={widget.count} empty={t("empty")} />
    </WidgetFrame>
  );
}

function TaggedNotesWidget({ widget }: { widget: HomeWidgetOf<"taggedNotes"> }) {
  const t = useTranslations("home.widgets.taggedNotes");
  const { ws } = useHome();
  const query = useWidgetNotes({ filter: "all", tag: widget.tag, limit: widget.count });
  return (
    <WidgetFrame
      widget={widget}
      title={`#${widget.tag}`}
      action={
        <PanelLink href={`/${ws}/notes?tag=${encodeURIComponent(widget.tag)}`}>
          {t("link")}
        </PanelLink>
      }
    >
      <NotesBody query={query} limit={widget.count} empty={t("empty", { tag: widget.tag })} />
    </WidgetFrame>
  );
}

function SharedNotesWidget({ widget }: { widget: HomeWidgetOf<"sharedNotes"> }) {
  const t = useTranslations("home.widgets.sharedNotes");
  const { ws } = useHome();
  const query = useWidgetNotes({ filter: "shared", limit: widget.count });
  return (
    <WidgetFrame
      widget={widget}
      title={t("title")}
      action={<PanelLink href={`/${ws}/notes?filter=shared`}>{t("link")}</PanelLink>}
    >
      <NotesBody query={query} limit={widget.count} empty={t("empty")} />
    </WidgetFrame>
  );
}

function useOpenTodos() {
  const { ws, todos } = useHome();
  return useTodos(ws, "open", todos, 50);
}

const TODOS_SHOWN = 6;

function TodosWidget({ widget }: { widget: HomeWidgetOf<"todos"> }) {
  const t = useTranslations("home.widgets.todos");
  const { ws, me, openNote, convert } = useHome();
  const { data: todos = [], isLoading } = useOpenTodos();
  return (
    <WidgetFrame
      widget={widget}
      title={t("title")}
      count={todos.length || undefined}
      action={<PanelLink href={`/${ws}/notes/todos`}>{t("link")}</PanelLink>}
    >
      <div data-testid="home-todos">
        {isLoading ? (
          <Skeleton className="h-32 w-full rounded-card" />
        ) : todos.length === 0 ? (
          <Quiet>
            <CircleCheck className="mr-1.5 inline size-3.5 align-[-2px] text-success" />
            {t("empty")}
          </Quiet>
        ) : (
          <ul className="overflow-hidden rounded-card border border-border">
            {todos.slice(0, TODOS_SHOWN).map((r) => (
              <TodoLine
                key={r.id}
                ws={ws}
                me={me.id}
                row={r}
                compact
                onOpenNote={openNote}
                onConvert={convert}
              />
            ))}
          </ul>
        )}
      </div>
    </WidgetFrame>
  );
}

function ReviewWidget({ widget }: { widget: HomeWidgetOf<"review"> }) {
  const t = useTranslations("home.widgets.review");
  const { ws, summary } = useHome();
  const edit = useContext(EditContext);
  const { data } = useNotesSummary(ws, summary);
  const left = data?.reviewLeft ?? 0;
  // Nothing to revisit: the nudge steps aside until tomorrow.
  if (!left && !edit) return null;
  return (
    <WidgetFrame widget={widget} title={t("title")} bare>
      {left ? (
        <Link
          href={`/${ws}/notes/review` as never}
          data-testid="review-nudge"
          className="flex items-center gap-3 rounded-card border border-sky-200 bg-sky-50 px-4 py-3 text-small focus-ring hover:border-sky-300"
        >
          <WIDGET_ICONS.review className="size-4 shrink-0 text-sky-700" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-sky-900">{t("title")}</span>
            <span className="block text-sky-800">{t("body", { count: left })}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-sky-700" />
        </Link>
      ) : (
        <Quiet>{t("done")}</Quiet>
      )}
    </WidgetFrame>
  );
}

/* ───────────────────────── work ───────────────────────── */

const AGENDA_SHOWN = 10;

function WhenLabel({ when }: { when: AgendaWhen }) {
  const t = useTranslations("home.widgets.today");
  const late = when.kind === "overdue";
  return (
    <span
      className={cn(
        "shrink-0 text-small tabular",
        late ? "font-medium text-danger-text" : "text-fg-muted",
      )}
    >
      {when.kind === "week" ? format(parseISO(when.date), "EEE") : t(when.kind)}
    </span>
  );
}

function TodayWidget({ widget }: { widget: HomeWidgetOf<"today"> }) {
  const t = useTranslations("home.widgets.today");
  const { ws, me, items, today, weekEnd } = useHome();
  const { data: todos = [] } = useOpenTodos();
  const toggle = useToggleTodo(ws, me.id);
  const entries = todayAgenda(items, todos, today, weekEnd);
  return (
    <WidgetFrame widget={widget} title={t("title")} count={entries.length || undefined}>
      {entries.length === 0 ? (
        <Quiet>{t("empty")}</Quiet>
      ) : (
        <ul className="overflow-hidden rounded-card border border-border" data-testid="today-list">
          {entries.slice(0, AGENDA_SHOWN).map((e) =>
            e.kind === "item" ? (
              <li key={e.item.id} className="border-b border-border last:border-0">
                <Link
                  href={`/${ws}/i/${e.item.identifier}` as never}
                  className="flex h-11 items-center gap-2.5 px-4 focus-ring hover:bg-surface-hover"
                >
                  <span className="contents @max-sm:hidden">
                    <PriorityIcon priority={e.item.priority} />
                  </span>
                  <span className="shrink-0 text-small font-medium text-fg-muted tabular">
                    {e.item.identifier}
                  </span>
                  <StateIcon
                    group={e.item.stateGroup}
                    color={e.item.stateColor}
                    label={e.item.stateName}
                  />
                  <span className="min-w-0 flex-1 truncate text-body font-medium">
                    {e.item.title}
                  </span>
                  <WhenLabel when={e.when} />
                </Link>
              </li>
            ) : (
              <li
                key={e.todo.id}
                className="flex h-11 items-center gap-2.5 border-b border-border px-4 last:border-0"
              >
                <Checkbox
                  checked={e.todo.checked}
                  aria-label={e.todo.text}
                  onCheckedChange={(v) =>
                    toggle.mutate({
                      noteId: e.todo.noteId,
                      blockId: e.todo.blockId,
                      checked: v === true,
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate text-body">{e.todo.text}</span>
                <WhenLabel when={e.when} />
              </li>
            ),
          )}
        </ul>
      )}
      {entries.length > AGENDA_SHOWN ? (
        <p className="px-1 text-small text-fg-muted tabular">
          {t("more", { count: entries.length - AGENDA_SHOWN })}
        </p>
      ) : null}
    </WidgetFrame>
  );
}

function AssignedWidget({ widget }: { widget: HomeWidgetOf<"assigned"> }) {
  const t = useTranslations("home.widgets.assigned");
  const { ws, items } = useHome();
  return (
    <WidgetFrame widget={widget} title={t("title")} count={items.length || undefined}>
      {items.length === 0 ? <Quiet>{t("empty")}</Quiet> : <MyItems ws={ws} items={items} />}
    </WidgetFrame>
  );
}

/** This week at a glance: items and to-dos due, per day; only counts when narrow. */
function WeekWidget({ widget }: { widget: HomeWidgetOf<"week"> }) {
  const t = useTranslations("home.widgets.week");
  const { ws, days, today, items } = useHome();
  const { data: todos = [] } = useOpenTodos();
  return (
    <WidgetFrame widget={widget} title={t("title")}>
      <ol className="grid grid-cols-7 overflow-hidden rounded-card border border-border">
        {days.map((day) => {
          const entries = [
            ...items.filter((i) => i.dueDate === day).map((i) => ({ kind: "item" as const, i })),
            ...todos.filter((x) => x.dueDate === day).map((x) => ({ kind: "todo" as const, x })),
          ];
          const isToday = day === today;
          return (
            <li
              key={day}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex min-h-[112px] min-w-0 flex-col gap-1 border-r border-border px-2 py-2 last:border-r-0",
                "@max-xl:min-h-16 @max-xl:items-center @max-xl:px-0.5",
                isToday && "bg-sky-50",
              )}
            >
              <div className="flex items-baseline gap-1.5 px-1 @max-xl:flex-col @max-xl:items-center @max-xl:gap-0">
                <span
                  className={cn(
                    "text-caption font-medium uppercase",
                    isToday ? "text-sky-700" : "text-fg-muted",
                  )}
                >
                  {format(parseISO(day), "EEE")}
                </span>
                <span
                  className={cn(
                    "text-body font-semibold tabular",
                    isToday ? "text-sky-700" : day < today ? "text-fg-muted" : "text-fg",
                  )}
                >
                  {format(parseISO(day), "d")}
                </span>
              </div>
              {entries.length > 0 ? (
                <span className="text-caption font-medium text-fg-muted tabular @xl:hidden">
                  {t("dueCount", { count: entries.length })}
                </span>
              ) : null}
              {entries.slice(0, 3).map((e) =>
                e.kind === "item" ? (
                  <Link
                    key={e.i.id}
                    href={`/${ws}/i/${e.i.identifier}` as never}
                    title={`${e.i.identifier} ${e.i.title}`}
                    className="flex h-6 min-w-0 items-center gap-1.5 rounded-[6px] px-1 text-small hover:bg-surface @max-xl:hidden"
                  >
                    <StateIcon group={e.i.stateGroup} color={e.i.stateColor} size={12} />
                    <span className="truncate">{e.i.title}</span>
                  </Link>
                ) : (
                  <span
                    key={e.x.id}
                    title={e.x.text}
                    className="flex h-6 min-w-0 items-center gap-1.5 px-1 text-small text-fg-secondary @max-xl:hidden"
                  >
                    <ListChecks className="size-3 shrink-0 text-icon" />
                    <span className="truncate">{e.x.text}</span>
                  </span>
                ),
              )}
              {entries.length > 3 ? (
                <span className="px-1 text-caption font-medium text-fg-muted tabular @max-xl:hidden">
                  {t("more", { count: entries.length - 3 })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </WidgetFrame>
  );
}

function ViewWidget({ widget }: { widget: HomeWidgetOf<"view"> }) {
  const t = useTranslations("home.widgets.view");
  const { ws } = useHome();
  const { data, isPending, isError, error, refetch } = useViewPreview(ws, widget.viewId);
  const gone = isError && isNotFound(error);
  return (
    <WidgetFrame
      widget={widget}
      title={data?.view.name ?? (isPending ? <Skeleton className="h-4 w-28" /> : t("title"))}
      action={data ? <PanelLink href={data.view.href}>{t("link")}</PanelLink> : undefined}
    >
      {isPending ? (
        <ListSkeleton />
      ) : gone ? (
        <Quiet>{t("gone")}</Quiet>
      ) : isError || !data ? (
        <WidgetError onRetry={() => void refetch()} />
      ) : data.rows.length === 0 ? (
        <Quiet>{t("empty")}</Quiet>
      ) : (
        <ul className="overflow-hidden rounded-card border border-border">
          {data.rows.map((r) => (
            <li key={r.id} className="border-b border-border last:border-0">
              <Link
                href={`/${ws}/i/${r.identifier}` as never}
                className="flex h-11 items-center gap-2.5 px-4 focus-ring hover:bg-surface-hover"
              >
                <span className="contents @max-sm:hidden">
                  <PriorityIcon priority={r.priority} />
                </span>
                <span className="shrink-0 text-small font-medium text-fg-muted tabular">
                  {r.identifier}
                </span>
                <StateIcon group={r.stateGroup} color={r.stateColor} label={r.stateName} />
                <span className="min-w-0 flex-1 truncate text-body font-medium">{r.title}</span>
                {r.dueDate ? (
                  <span className="shrink-0 text-small text-fg-muted tabular @max-sm:hidden">
                    {format(parseISO(r.dueDate), "d MMM")}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
          {data.more ? (
            <li>
              <Link
                href={data.view.href as never}
                className="flex h-9 items-center px-4 text-small text-fg-muted focus-ring hover:bg-surface-hover hover:text-fg"
              >
                {t("more")}
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </WidgetFrame>
  );
}

/* ───────────────────────── inbox and mail ───────────────────────── */

const NOTIFICATION_VERBS = [
  "MENTION",
  "ASSIGNED",
  "WORK_ITEM_UPDATED",
  "COMMENT",
  "INTAKE_SUBMITTED",
  "INTAKE_REPLY",
  "AGENT_APPROVAL_REQUESTED",
  "AGENT_RUN_FINISHED",
  "EMAIL_ASSIGNED",
  "EMAIL_MENTION",
  "EMAIL_REPLY",
  "DUE_SOON",
  "SNOOZE_ENDED",
] as const;

function InboxWidget({ widget }: { widget: HomeWidgetOf<"inbox"> }) {
  const t = useTranslations("myWork");
  const { ws, inbox } = useHome();
  const relative = useRelativeTime();
  const verb = (type: string) =>
    (NOTIFICATION_VERBS as readonly string[]).includes(type)
      ? t(`inboxVerb.${type as (typeof NOTIFICATION_VERBS)[number]}`)
      : t("inboxVerb.other");
  return (
    <WidgetFrame
      widget={widget}
      title={t("inbox")}
      count={inbox.unread ? t("unread", { count: inbox.unread }) : undefined}
      action={<PanelLink href={`/${ws}/inbox`}>{t("openInbox")}</PanelLink>}
    >
      {inbox.latest.length === 0 ? (
        <Quiet>{t("inboxEmpty")}</Quiet>
      ) : (
        <ul className="overflow-hidden rounded-card border border-border">
          {inbox.latest.map((n) => (
            <li key={n.id} className="border-b border-border last:border-0">
              <Link
                href={(n.item ? `/${ws}/i/${n.item.identifier}` : `/${ws}/inbox`) as never}
                className="flex items-start gap-2.5 px-3.5 py-2.5 focus-ring hover:bg-surface-hover"
              >
                {n.actor ? (
                  <Avatar user={n.actor} size="sm" className="mt-0.5" />
                ) : (
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-150 text-icon">
                    <Bell className="size-3.5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-small",
                      n.read ? "text-fg-secondary" : "font-semibold text-fg",
                    )}
                  >
                    {n.actor?.name ?? t("someone")} {verb(n.type)}
                  </span>
                  <span className="block truncate text-small text-fg-muted">
                    {n.item ? (
                      <>
                        <span className="tabular">{n.item.identifier}</span> {n.item.title}
                      </>
                    ) : (
                      (n.title ?? "")
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-caption text-fg-muted tabular" suppressHydrationWarning>
                    {relative(n.createdAt)}
                  </span>
                  {!n.read ? (
                    <span
                      aria-label={t("unreadDot")}
                      className="size-1.5 rounded-full bg-sky-600"
                    />
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

const MAIL_SHOWN = 5;

function MailWidget({ widget }: { widget: HomeWidgetOf<"mail"> }) {
  const t = useTranslations("home.widgets.mail");
  const { ws } = useHome();
  const relative = useRelativeTime();
  const { data, isPending, isError, refetch } = useThreads(ws, {
    mailbox: null,
    view: "mine",
    q: null,
  });
  const rows = data?.pages[0]?.rows ?? [];
  return (
    <WidgetFrame
      widget={widget}
      title={t("title")}
      count={rows.length ? (rows.length > MAIL_SHOWN ? `${MAIL_SHOWN}+` : rows.length) : undefined}
      action={<PanelLink href={`/${ws}/mail?view=mine`}>{t("link")}</PanelLink>}
    >
      {isPending ? (
        <ListSkeleton />
      ) : isError && !data ? (
        <WidgetError onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Quiet>{t("empty")}</Quiet>
      ) : (
        <ul className="overflow-hidden rounded-card border border-border">
          {rows.slice(0, MAIL_SHOWN).map((r) => (
            <li key={r.id} className="border-b border-border last:border-0">
              <Link
                href={`/${ws}/mail?view=mine&thread=${r.id}` as never}
                className="flex items-start gap-2.5 px-3.5 py-2.5 focus-ring hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-small",
                      r.unread ? "font-semibold text-fg" : "text-fg-secondary",
                    )}
                  >
                    {r.subject || t("noSubject")}
                  </span>
                  <span className="block truncate text-small text-fg-muted">
                    {r.correspondent?.name ?? r.correspondent?.email ?? ""}
                  </span>
                </span>
                <span
                  className="shrink-0 text-caption text-fg-muted tabular"
                  suppressHydrationWarning
                >
                  {relative(r.lastMessageAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

/* ───────────────────────── analytics ───────────────────────── */

function ChartWidget({ widget }: { widget: HomeWidgetOf<"chart"> }) {
  const t = useTranslations("home.widgets.chart");
  const ta = useTranslations("analytics");
  const { ws } = useHome();
  const { spec } = homeChart(widget.chart);
  const { data, isPending, isError, refetch } = useMetric(ws, {
    spec,
    range: widget.range,
    projectId: null,
  });
  const number = spec.chartType === "NUMBER";
  return (
    <WidgetFrame
      widget={widget}
      title={ta(`default.${widget.chart}`)}
      count={ta(`range.${widget.range}`)}
      action={<PanelLink href={`/${ws}/analytics`}>{t("link")}</PanelLink>}
    >
      <div className="rounded-card border border-border bg-surface p-4">
        {isPending ? (
          <WidgetSkeleton number={number} />
        ) : isError && !data ? (
          <div
            className="flex flex-col items-center justify-center gap-2 text-center"
            style={{ minHeight: number ? undefined : PLOT_HEIGHT }}
          >
            <p className="text-body text-fg-muted">{ta("widget.error")}</p>
            <Button variant="secondary" size="xs" onClick={() => void refetch()}>
              <RotateCcw />
              {ta("widget.retry")}
            </Button>
          </div>
        ) : data && !number && isEmptyChart(data) ? (
          <div
            className="flex flex-col items-center justify-center gap-1 text-center"
            style={{ minHeight: PLOT_HEIGHT }}
          >
            <BarChart3 className="size-5 text-icon" aria-hidden />
            <p className="text-body font-medium text-fg-secondary">{ta("widget.empty")}</p>
            <p className="text-small text-fg-muted">{ta("widget.emptyHint")}</p>
          </div>
        ) : data ? (
          <ChartView data={data} chartType={spec.chartType} segment={spec.segment} />
        ) : null}
      </div>
    </WidgetFrame>
  );
}

/* ───────────────────────── registry ───────────────────────── */

/** Renders one widget by type. */
export function HomeWidgetView({ widget }: { widget: HomeWidget }) {
  switch (widget.type) {
    case "pinnedNotes":
      return <PinnedNotesWidget widget={widget} />;
    case "recentNotes":
      return <RecentNotesWidget widget={widget} />;
    case "taggedNotes":
      return <TaggedNotesWidget widget={widget} />;
    case "sharedNotes":
      return <SharedNotesWidget widget={widget} />;
    case "todos":
      return <TodosWidget widget={widget} />;
    case "today":
      return <TodayWidget widget={widget} />;
    case "assigned":
      return <AssignedWidget widget={widget} />;
    case "review":
      return <ReviewWidget widget={widget} />;
    case "inbox":
      return <InboxWidget widget={widget} />;
    case "week":
      return <WeekWidget widget={widget} />;
    case "view":
      return <ViewWidget widget={widget} />;
    case "mail":
      return <MailWidget widget={widget} />;
    case "chart":
      return <ChartWidget widget={widget} />;
  }
}
