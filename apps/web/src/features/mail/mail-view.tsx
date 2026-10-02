"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlarmClock,
  ArrowLeft,
  CheckCircle2,
  Inbox,
  Layers,
  Mail,
  Paperclip,
  Search,
  Settings,
  UserRound,
  UserRoundX,
} from "lucide-react";
import { MAIL_VIEWS, type MailView as View } from "@dopl/shared/schemas/mail";
import { cn } from "@/lib/cn";
import { isTypingTarget, resolveShortcut } from "@/lib/shortcuts/registry";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { TagDot } from "@/components/ui/tag";
import { PageHeader } from "@/components/shell/page-header";
import { staysInView, useMailboxes, useThreadActions, useThreads, useVisibleRows } from "./data";
import { ThreadReader } from "./thread-reader";
import type { MailboxSummary, ThreadPage, ThreadRow } from "./types";

const parsers = {
  mailbox: parseAsString,
  view: parseAsStringLiteral(MAIL_VIEWS).withDefault("open"),
  thread: parseAsString,
  q: parseAsString,
};

const VIEW_ICON: Record<View, React.ReactNode> = {
  unassigned: <UserRoundX />,
  mine: <UserRound />,
  open: <Inbox />,
  snoozed: <AlarmClock />,
  solved: <CheckCircle2 />,
  all: <Layers />,
};

const rowClasses = (active: boolean) =>
  cn(
    "flex h-8 w-full min-w-0 items-center gap-2 rounded-control px-2.5 text-left text-body font-medium text-fg-secondary focus-ring",
    "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-icon",
    active ? "bg-neutral-150 text-fg [&>svg]:text-icon-strong" : "hover:bg-surface-hover",
  );

/** The shared mailbox (ROADMAP §7a.4): views, the thread list, the reader. */
export function MailView({
  ws,
  me,
  isAdmin,
  initialMailboxes,
  initialPage,
}: {
  ws: string;
  me: string;
  isAdmin: boolean;
  initialMailboxes: MailboxSummary[];
  initialPage?: ThreadPage;
}) {
  const t = useTranslations("mail");
  const [url, setUrl] = useQueryStates(parsers);
  const { data: mailboxes = initialMailboxes } = useMailboxes(ws, initialMailboxes);
  const params = { mailbox: url.mailbox, view: url.view, q: url.q };
  // The server renders the Open list once. It seeds the cache only when the page
  // loaded on that view; seeded later (after a view switch) it would count as
  // fresh and hide changes made since the page loaded.
  const [seed] = useState(() =>
    initialPage && !url.mailbox && url.view === "open" && !url.q
      ? { page: initialPage, at: Date.now() }
      : undefined,
  );
  const counts = (v: View) =>
    v === "unassigned" || v === "mine" || v === "open"
      ? mailboxes
          .filter((m) => !url.mailbox || m.id === url.mailbox)
          .reduce((n, m) => n + m.counts[v], 0)
      : undefined;

  const list = useThreads(
    ws,
    params,
    seed && !url.mailbox && url.view === "open" && !url.q ? seed : undefined,
    mailboxes.length > 0,
  );
  const rows = useVisibleRows(ws, url.view, list.data);
  const { mutate: setStatus } = useThreadActions(ws).setStatus;
  const listRef = useRef<HTMLUListElement>(null);

  /** Opens a thread from the keyboard: its row takes the focus and scrolls into view. */
  const open = useCallback(
    (id: string) => {
      void setUrl({ thread: id });
      const row = listRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: "nearest" });
    },
    [setUrl],
  );

  /** Sets a thread aside as not actionable; the reader moves on to its neighbour. */
  const ignore = useCallback(
    (thread: Pick<ThreadRow, "id" | "status">) => {
      if (thread.status === "IGNORED") return;
      const i = rows.findIndex((r) => r.id === thread.id);
      if (i >= 0 && url.thread === thread.id) {
        const next = rows[i + 1] ?? (staysInView(url.view, "IGNORED") ? undefined : rows[i - 1]);
        if (next) open(next.id);
        else if (!staysInView(url.view, "IGNORED")) void setUrl({ thread: null });
      }
      setStatus({ threadId: thread.id, status: "IGNORED" });
      toast(t("ignoredToast"), {
        action: {
          label: t("undo"),
          onClick: () => {
            setStatus({ threadId: thread.id, status: thread.status });
            void setUrl({ thread: thread.id });
          },
        },
      });
    },
    [open, rows, setStatus, setUrl, t, url.thread, url.view],
  );

  // Where the open thread sits in the list. One that has left it (solved,
  // snoozed) keeps its place, so the next ↑/↓ goes to its neighbours.
  const anchor = useRef(-1);
  useEffect(() => {
    const i = url.thread ? rows.findIndex((r) => r.id === url.thread) : -1;
    if (i >= 0 || !url.thread) anchor.current = i;
  }, [rows, url.thread]);

  // Keyboard layer (DESIGN_SYSTEM §7.1, "mail" scope in the registry).
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      const id = resolveShortcut(e, ["mail"]);
      if (!id) return;
      const i = rows.findIndex((r) => r.id === url.thread);
      if (id === "mailIgnore") {
        const row = rows[i];
        // Not on key repeat: holding ⌫ must not empty the list.
        if (!row || e.repeat) return;
        e.preventDefault();
        ignore(row);
        return;
      }
      const down = id === "mailDown" || id === "mailDownArrow";
      const at = i >= 0 ? i + (down ? 1 : -1) : anchor.current - (down ? 0 : 1);
      const next = rows[Math.min(rows.length - 1, Math.max(0, at))];
      if (!next) return;
      e.preventDefault();
      open(next.id);
      if (at >= rows.length - 1 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fetchNextPage, hasNextPage, ignore, isFetchingNextPage, open, rows, url.thread]);

  const header = (
    <PageHeader
      crumbs={[{ label: t("title"), icon: <Mail /> }]}
      actions={
        isAdmin ? (
          <Button asChild variant="secondary">
            <Link href={`/${ws}/settings/mailboxes` as never}>
              <Settings />
              <span className="hidden sm:inline">{t("manage")}</span>
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  if (mailboxes.length === 0)
    return (
      <>
        {header}
        <EmptyState
          icon={<Mail />}
          title={t("empty.noMailboxTitle")}
          description={isAdmin ? t("empty.noMailboxAdmin") : t("empty.noMailboxMember")}
          action={
            isAdmin ? (
              <Button asChild variant="primary">
                <Link href={`/${ws}/settings/mailboxes` as never}>{t("connect")}</Link>
              </Button>
            ) : undefined
          }
        />
      </>
    );

  return (
    <>
      {header}
      <div className="flex min-h-0 flex-1">
        {/* Views and mailboxes */}
        <nav
          aria-label={t("title")}
          className="hidden w-56 shrink-0 scrollbar-thin flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4 lg:flex"
          data-testid="mail-sidebar"
        >
          {MAIL_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={rowClasses(url.view === v)}
              aria-current={url.view === v ? "page" : undefined}
              onClick={() => void setUrl({ view: v, thread: null })}
              data-testid={`mail-view-${v}`}
            >
              {VIEW_ICON[v]}
              <span className="truncate">{t(`view.${v}`)}</span>
              {counts(v) ? (
                <span className="ml-auto text-caption font-medium text-fg-muted tabular">
                  {counts(v)}
                </span>
              ) : null}
            </button>
          ))}
          {mailboxes.length > 1 ? (
            <>
              <p className="mt-5 mb-1 px-2.5 text-caption font-medium text-fg-muted">
                {t("mailboxes")}
              </p>
              <button
                type="button"
                className={rowClasses(!url.mailbox)}
                onClick={() => void setUrl({ mailbox: null, thread: null })}
              >
                <Mail />
                <span className="truncate">{t("allMailboxes")}</span>
              </button>
              {mailboxes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={rowClasses(url.mailbox === m.id)}
                  onClick={() => void setUrl({ mailbox: m.id, thread: null })}
                  title={m.emailAddress}
                >
                  <Mail />
                  <span className="truncate">{m.displayName ?? m.emailAddress}</span>
                  {m.counts.open ? (
                    <span className="ml-auto text-caption font-medium text-fg-muted tabular">
                      {m.counts.open}
                    </span>
                  ) : null}
                </button>
              ))}
            </>
          ) : null}
        </nav>

        {/* Thread list */}
        <section
          className={cn(
            "flex min-h-0 w-full shrink-0 flex-col border-border md:w-[380px] md:border-r",
            url.thread && "hidden md:flex",
          )}
          aria-label={t(`view.${url.view}`)}
        >
          <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 lg:hidden">
              {MAIL_VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => void setUrl({ view: v, thread: null })}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center rounded-chip border px-2.5 text-small focus-ring",
                    url.view === v
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : "border-border bg-surface text-fg-secondary",
                  )}
                >
                  {t(`view.${v}`)}
                </button>
              ))}
            </div>
            <SearchBox
              value={url.q ?? ""}
              onChange={(q) => void setUrl({ q: q || null, thread: null })}
            />
          </div>
          <ThreadList
            list={list}
            rows={rows}
            view={url.view}
            searching={Boolean(url.q)}
            selected={url.thread}
            onSelect={(id) => void setUrl({ thread: id })}
            listRef={listRef}
          />
        </section>

        {/* Reader */}
        <section className={cn("min-w-0 flex-1 flex-col", url.thread ? "flex" : "hidden md:flex")}>
          {url.thread ? (
            <>
              <div className="border-b border-border px-3 py-2 md:hidden">
                <Button variant="ghost" size="sm" onClick={() => void setUrl({ thread: null })}>
                  <ArrowLeft />
                  {t("back")}
                </Button>
              </div>
              <ThreadReader
                key={url.thread}
                ws={ws}
                threadId={url.thread}
                me={me}
                canManage={isAdmin}
                onIgnore={ignore}
              />
            </>
          ) : (
            <EmptyState
              icon={<Mail />}
              title={t("empty.noThreadTitle")}
              description={t("empty.noThread")}
            />
          )}
        </section>
      </div>
    </>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const t = useTranslations("mail");
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Follow outside changes to the query (a view switch clears it).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-icon" />
      <input
        type="search"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const next = e.target.value;
          timer.current = setTimeout(() => onChange(next.trim()), 250);
        }}
        placeholder={t("search")}
        aria-label={t("search")}
        className="h-8 w-full rounded-chip border border-border bg-surface pr-2.5 pl-8 text-body text-fg outline-none placeholder:text-fg-placeholder focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-sky-400/30"
        data-testid="mail-search"
      />
    </label>
  );
}

function ThreadList({
  list,
  rows,
  view,
  searching,
  selected,
  onSelect,
  listRef,
}: {
  list: ReturnType<typeof useThreads>;
  rows: ThreadRow[];
  view: View;
  searching: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  listRef: React.Ref<HTMLUListElement>;
}) {
  const t = useTranslations("mail");
  const { isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = list;
  if (isPending)
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-card" />
        ))}
      </div>
    );
  if (isError)
    return (
      <EmptyState
        compact
        title={t("empty.errorTitle")}
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        }
      />
    );
  if (rows.length === 0)
    return (
      <EmptyState
        compact
        icon={VIEW_ICON[view]}
        title={searching ? t("empty.noResults") : t(`empty.view.${view}`)}
      />
    );
  return (
    <ul
      ref={listRef}
      className="min-h-0 flex-1 scrollbar-thin overflow-y-auto"
      data-testid="thread-list"
    >
      {rows.map((r) => (
        <ThreadRowView
          key={r.id}
          row={r}
          active={r.id === selected}
          onSelect={() => onSelect(r.id)}
        />
      ))}
      {hasNextPage ? (
        <li className="p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            loading={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        </li>
      ) : null}
    </ul>
  );
}

function ThreadRowView({
  row,
  active,
  onSelect,
}: {
  row: ThreadRow;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("mail");
  const relative = useRelativeTime();
  const who = row.correspondent?.name ?? row.correspondent?.email ?? "";
  const ignored = row.status === "IGNORED";
  return (
    <li className="border-b border-border">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        data-testid="thread-row"
        data-id={row.id}
        data-status={row.status}
        className={cn(
          // Keyboard focus is an inset left bar (DESIGN_SYSTEM §4.3); a ring would be clipped by the list.
          "flex w-full flex-col gap-0.5 px-4 py-3 text-left outline-none focus-visible:shadow-[inset_2px_0_0_var(--color-focus)]",
          active ? "bg-surface-selected" : "hover:bg-surface-hover",
        )}
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-body",
              row.unread ? "font-semibold text-fg" : "font-medium text-fg-secondary",
            )}
          >
            {who}
          </span>
          {row.hasAttachments ? <Paperclip className="size-3.5 shrink-0 text-icon" /> : null}
          <time
            className="shrink-0 text-caption text-fg-muted tabular"
            dateTime={row.lastMessageAt}
            suppressHydrationWarning
          >
            {relative(row.lastMessageAt)}
          </time>
        </span>
        <span className={cn("truncate text-body", ignored ? "text-fg-muted" : "text-fg")}>
          {row.subject}
          {row.messageCount > 1 ? (
            <span className="ml-1.5 text-caption text-fg-muted tabular">{row.messageCount}</span>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-small text-fg-muted">{row.snippet}</span>
          {ignored ? (
            <span className="shrink-0 text-caption font-medium text-fg-muted">{t("ignored")}</span>
          ) : null}
          {row.labels.slice(0, 2).map((l) => (
            <span
              key={l.id}
              className="inline-flex shrink-0 items-center gap-1 text-caption text-fg-muted"
            >
              <TagDot color={l.color} />
              {l.name}
            </span>
          ))}
          {row.assignee ? <Avatar user={row.assignee} size="xs" /> : null}
        </span>
      </button>
    </li>
  );
}
