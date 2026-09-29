"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useTranslations } from "next-intl";
import { format, parseISO } from "date-fns";
import {
  ArrowRight,
  Bell,
  CircleCheck,
  Inbox,
  ListChecks,
  Repeat2,
  StickyNote,
  Target,
} from "lucide-react";
import type { Priority } from "@dopl/shared/schemas/work-item";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StateIcon } from "@/components/icons/state-icon";
import { PriorityIcon } from "@/components/icons/priority-icon";
import { CaptureComposer, type Me } from "@/features/notes/capture";
import { useNotes, useNotesSummary, useToggleTodo, useTodos } from "@/features/notes/data";
import { NoteCardView } from "@/features/notes/note-card";
import { NoteDialog } from "@/features/notes/note-dialog";
import { TodoLine } from "@/features/notes/todos-view";
import { ConvertDialog, type ConvertTarget } from "@/features/notes/convert-dialog";
import type { NoteCard, NotesSummary, TodoRow } from "@/features/notes/types";
import type { InboxSummary } from "@/server/queries/home";
import type { MyItem } from "./my-items";

/* ───────────────────────── shared bits ───────────────────────── */

function Panel({
  title,
  icon,
  count,
  action,
  children,
  testId,
}: {
  title: string;
  icon: React.ReactNode;
  count?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex h-7 items-center gap-2">
        <span className="text-icon [&_svg]:size-4">{icon}</span>
        <h2 className="text-body font-semibold">{title}</h2>
        {count !== undefined ? (
          <span className="text-small text-fg-muted tabular">{count}</span>
        ) : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
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

/* ───────────────────────── calendar strip ───────────────────────── */

/** This week at a glance: items due and to-dos due, per day. */
export function CalendarStrip({
  ws,
  days,
  today,
  items,
  todos,
}: {
  ws: string;
  days: string[];
  today: string;
  items: MyItem[];
  todos: TodoRow[];
}) {
  const t = useTranslations("myWork");
  return (
    <section aria-label={t("week")} data-testid="calendar-strip">
      <ol className="grid grid-cols-7 overflow-hidden rounded-card border border-border">
        {days.map((day) => {
          const dayItems = items.filter((i) => i.dueDate === day);
          const dayTodos = todos.filter((x) => x.dueDate === day);
          const entries = [
            ...dayItems.map((i) => ({ key: i.id, kind: "item" as const, i })),
            ...dayTodos.map((x) => ({ key: x.id, kind: "todo" as const, x })),
          ];
          const isToday = day === today;
          const past = day < today;
          return (
            <li
              key={day}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex min-h-[112px] min-w-0 flex-col gap-1 border-r border-border px-2 py-2 last:border-r-0",
                isToday && "bg-sky-50",
              )}
            >
              <div className="flex items-baseline gap-1.5 px-1">
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
                    isToday ? "text-sky-700" : past ? "text-fg-muted" : "text-fg",
                  )}
                >
                  {format(parseISO(day), "d")}
                </span>
              </div>
              {entries.slice(0, 3).map((e) =>
                e.kind === "item" ? (
                  <Link
                    key={e.key}
                    href={`/${ws}/i/${e.i.identifier}` as never}
                    title={`${e.i.identifier} ${e.i.title}`}
                    className="flex h-6 min-w-0 items-center gap-1.5 rounded-[6px] px-1 text-small hover:bg-surface"
                  >
                    <StateIcon group={e.i.stateGroup} color={e.i.stateColor} size={12} />
                    <span className="truncate">{e.i.title}</span>
                  </Link>
                ) : (
                  <span
                    key={e.key}
                    title={e.x.text}
                    className="flex h-6 min-w-0 items-center gap-1.5 px-1 text-small text-fg-secondary"
                  >
                    <ListChecks className="size-3 shrink-0 text-icon" />
                    <span className="truncate">{e.x.text}</span>
                  </span>
                ),
              )}
              {entries.length > 3 ? (
                <span className="px-1 text-caption font-medium text-fg-muted tabular">
                  {t("more", { count: entries.length - 3 })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ───────────────────────── today's focus ───────────────────────── */

/** In progress, due today, and to-dos due by today: a short list to start the day. */
export function TodaysFocus({
  ws,
  me,
  today,
  items,
  todos,
}: {
  ws: string;
  me: string;
  today: string;
  items: MyItem[];
  todos: TodoRow[];
}) {
  const t = useTranslations("myWork");
  const toggle = useToggleTodo(ws, me);
  const rank: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
  const focusItems = items
    .filter((i) => i.dueDate === today || i.stateGroup === "STARTED")
    .sort(
      (a, b) =>
        Number(b.dueDate === today) - Number(a.dueDate === today) ||
        rank[a.priority] - rank[b.priority],
    )
    .slice(0, 5);
  const focusTodos = todos.filter((x) => x.dueDate && x.dueDate <= today).slice(0, 4);
  return (
    <Panel
      title={t("focus")}
      icon={<Target />}
      count={focusItems.length + focusTodos.length || undefined}
      testId="focus"
    >
      {focusItems.length + focusTodos.length === 0 ? (
        <Quiet>{t("focusEmpty")}</Quiet>
      ) : (
        <ul className="overflow-hidden rounded-card border border-border">
          {focusItems.map((i) => (
            <li key={i.id} className="border-b border-border last:border-0">
              <Link
                href={`/${ws}/i/${i.identifier}` as never}
                className="flex h-11 items-center gap-2.5 px-4 focus-ring hover:bg-surface-hover"
              >
                <PriorityIcon priority={i.priority} />
                <span className="w-[76px] shrink-0 text-small font-medium text-fg-muted tabular">
                  {i.identifier}
                </span>
                <StateIcon group={i.stateGroup} color={i.stateColor} label={i.stateName} />
                <span className="min-w-0 flex-1 truncate text-body font-medium">{i.title}</span>
                <span className="shrink-0 text-small text-fg-muted">
                  {i.dueDate === today ? t("dueToday") : t("inProgress")}
                </span>
              </Link>
            </li>
          ))}
          {focusTodos.map((x) => (
            <li
              key={x.id}
              className="flex h-11 items-center gap-2.5 border-b border-border px-4 last:border-0"
            >
              <Checkbox
                checked={x.checked}
                aria-label={x.text}
                onCheckedChange={(v) =>
                  toggle.mutate({ noteId: x.noteId, blockId: x.blockId, checked: v === true })
                }
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-body",
                  x.checked && "text-fg-muted line-through",
                )}
              >
                {x.text}
              </span>
              <span
                className={cn(
                  "shrink-0 text-small tabular",
                  x.dueDate && x.dueDate < today ? "text-danger-text" : "text-fg-muted",
                )}
              >
                {x.dueDate && x.dueDate < today ? t("overdue") : t("dueToday")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ───────────────────────── side column ───────────────────────── */

const NOTIFICATION_TYPES = [
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

export function InboxCard({ ws, inbox }: { ws: string; inbox: InboxSummary }) {
  const t = useTranslations("myWork");
  const relative = useRelativeTime();
  const verb = (type: string) =>
    (NOTIFICATION_TYPES as readonly string[]).includes(type)
      ? t(`inboxVerb.${type as (typeof NOTIFICATION_TYPES)[number]}`)
      : t("inboxVerb.other");
  return (
    <Panel
      title={t("inbox")}
      icon={<Inbox />}
      count={inbox.unread ? t("unread", { count: inbox.unread }) : undefined}
      action={<PanelLink href={`/${ws}/inbox`}>{t("openInbox")}</PanelLink>}
      testId="home-inbox"
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
                  <span className="text-caption text-fg-muted tabular">
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
    </Panel>
  );
}

export function RecentNotes({
  ws,
  me,
  initial,
  onOpen,
}: {
  ws: string;
  me: Me;
  initial: NoteCard[];
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("myWork");
  const { data: notes = [] } = useNotes(ws, { filter: "recent", limit: 3 }, initial);
  return (
    <Panel
      title={t("recentNotes")}
      icon={<StickyNote />}
      action={<PanelLink href={`/${ws}/notes`}>{t("viewAll")}</PanelLink>}
      testId="home-notes"
    >
      {notes.length === 0 ? (
        <Quiet>{t("notesEmpty")}</Quiet>
      ) : (
        <div className="flex flex-col gap-2.5">
          {notes.map((n) => (
            <NoteCardView key={n.id} ws={ws} me={me} card={n} variant="compact" onOpen={onOpen} />
          ))}
        </div>
      )}
    </Panel>
  );
}

export function ReviewNudge({ ws, initial }: { ws: string; initial: NotesSummary }) {
  const t = useTranslations("myWork");
  const { data } = useNotesSummary(ws, initial);
  if (!data?.reviewLeft) return null;
  return (
    <Link
      href={`/${ws}/notes/review` as never}
      data-testid="review-nudge"
      className="flex items-center gap-3 rounded-card border border-sky-200 bg-sky-50 px-4 py-3 text-small focus-ring hover:border-sky-300"
    >
      <Repeat2 className="size-4 shrink-0 text-sky-700" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-sky-900">{t("reviewTitle")}</span>
        <span className="block text-sky-800">{t("reviewBody", { count: data.reviewLeft })}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-sky-700" />
    </Link>
  );
}

/* ───────────────────────── page body ───────────────────────── */

export function HomeView({
  ws,
  me,
  days,
  today,
  items,
  itemsSlot,
  initialTodos,
  initialNotes,
  summary,
  inbox,
}: {
  ws: string;
  me: Me;
  days: string[];
  today: string;
  items: MyItem[];
  /** The server-rendered "Assigned to me" list. */
  itemsSlot: React.ReactNode;
  initialTodos: TodoRow[];
  initialNotes: NoteCard[];
  summary: NotesSummary;
  inbox: InboxSummary;
}) {
  const [convert, setConvert] = useState<ConvertTarget | null>(null);
  const { data: todos, isLoading } = useTodos(ws, "open", initialTodos, 50);
  const [, setNote] = useQueryState("note");
  const openNote = (id: string) => void setNote(id);
  return (
    <>
      <CaptureComposer ws={ws} me={me} className="w-full" />
      <CalendarStrip ws={ws} days={days} today={today} items={items} todos={todos ?? []} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          <TodaysFocus ws={ws} me={me.id} today={today} items={items} todos={todos ?? []} />
          {itemsSlot}
        </div>
        <aside className="flex min-w-0 flex-col gap-8">
          <ReviewNudge ws={ws} initial={summary} />
          <HomeTodosList
            ws={ws}
            me={me}
            todos={todos ?? []}
            loading={isLoading}
            onOpenNote={openNote}
            onConvert={setConvert}
          />
          <InboxCard ws={ws} inbox={inbox} />
          <RecentNotes ws={ws} me={me} initial={initialNotes} onOpen={openNote} />
        </aside>
      </div>
      <ConvertDialog ws={ws} me={me.id} target={convert} onClose={() => setConvert(null)} />
      <NoteDialog ws={ws} me={me} />
    </>
  );
}

function HomeTodosList({
  ws,
  me,
  todos,
  loading,
  onOpenNote,
  onConvert,
}: {
  ws: string;
  me: Me;
  todos: TodoRow[];
  loading: boolean;
  onOpenNote: (id: string) => void;
  onConvert: (t: ConvertTarget) => void;
}) {
  const t = useTranslations("myWork");
  return (
    <Panel
      title={t("todos")}
      icon={<ListChecks />}
      count={todos.length || undefined}
      action={<PanelLink href={`/${ws}/notes/todos`}>{t("viewAll")}</PanelLink>}
      testId="home-todos"
    >
      {loading ? (
        <Skeleton className="h-32 w-full rounded-card" />
      ) : todos.length === 0 ? (
        <Quiet>
          <CircleCheck className="mr-1.5 inline size-3.5 align-[-2px] text-success" />
          {t("todosEmpty")}
        </Quiet>
      ) : (
        <ul className="overflow-hidden rounded-card border border-border">
          {todos.slice(0, 6).map((r) => (
            <TodoLine
              key={r.id}
              ws={ws}
              me={me.id}
              row={r}
              compact
              onOpenNote={onOpenNote}
              onConvert={onConvert}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
