"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlarmClock,
  Archive,
  ArrowLeft,
  Check,
  CheckCheck,
  Ellipsis,
  Inbox,
  ListFilter,
  Mail,
  MailOpen,
  Settings,
  X,
} from "lucide-react";
import {
  INBOX_FILTER_KEYS,
  type InboxFilter,
  type InboxView as View,
} from "@dopl/shared/schemas/inbox";
import { cn } from "@/lib/cn";
import { isTypingTarget, resolveShortcut } from "@/lib/shortcuts/registry";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shell/page-header";
import {
  useInbox,
  useInboxCounts,
  useInboxMutations,
  type InboxAction,
  type InboxRow,
} from "./data";
import { InboxRowView } from "./inbox-row";
import { InboxReader } from "./inbox-reader";
import { useNotificationText } from "./notification-text";
import { SnoozeMenu } from "./snooze-menu";

const VIEWS = ["all", "unread", "snoozed", "archived"] as const;

/**
 * The Inbox (DESIGN_SYSTEM §4.6): a 380 px list and a reader. The list is
 * keyboard-driven (J/K move and open, X select, E archive, U read/unread,
 * Z snooze); opening a notification marks it read.
 */
export function InboxView({ ws }: { ws: string }) {
  const t = useTranslations("inbox");
  const router = useRouter();
  const [view, setView] = useQueryState("view", parseAsStringLiteral(VIEWS).withDefault("all"));
  const [filter, setFilter] = useQueryState("type", parseAsStringLiteral(INBOX_FILTER_KEYS));
  const [openId, setOpenId] = useQueryState("n");
  const inbox = useInbox(ws, view, filter);
  const counts = useInboxCounts(ws).data;
  const { update, snooze, markAll } = useInboxMutations(ws);
  const text = useNotificationText();

  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (inbox.data?.pages ?? [])
      .flatMap((p) => p.rows)
      .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  }, [inbox.data]);
  const texts = useMemo(() => new Map(rows.map((r) => [r.id, text(r)])), [rows, text]);

  // The open notification stays in the reader even after it leaves the list
  // (read while showing "Unread"…) until you move on.
  const [opened, setOpened] = useState<InboxRow | null>(null);
  const openRow =
    rows.find((r) => r.id === openId) ?? (opened && opened.id === openId ? opened : null);

  const [focusedId, setFocusedId] = useState<string | null>(openId);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [bulkSnoozeOpen, setBulkSnoozeOpen] = useState(false);
  const anchor = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const open = useCallback(
    (row: InboxRow) => {
      void setOpenId(row.id);
      setFocusedId(row.id);
      setOpened({ ...row, readAt: row.readAt ?? new Date().toISOString() });
      if (!row.readAt) update.mutate({ ids: [row.id], action: "read" });
    },
    [setOpenId, update],
  );

  const toggleSelect = useCallback(
    (id: string, range: boolean) => {
      setSelection((prev) => {
        const next = new Set(prev);
        if (range && anchor.current) {
          const a = rows.findIndex((r) => r.id === anchor.current);
          const b = rows.findIndex((r) => r.id === id);
          if (a >= 0 && b >= 0)
            for (const r of rows.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(r.id);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        anchor.current = id;
        return next;
      });
    },
    [rows],
  );

  /** After a row leaves the list, the reader moves on to its neighbour. */
  const moveOnFrom = useCallback(
    (ids: string[]) => {
      if (!openId || !ids.includes(openId)) return;
      const i = rows.findIndex((r) => r.id === openId);
      const next =
        rows.slice(i + 1).find((r) => !ids.includes(r.id)) ??
        rows
          .slice(0, Math.max(i, 0))
          .reverse()
          .find((r) => !ids.includes(r.id));
      if (next) open(next);
      else void setOpenId(null);
    },
    [open, openId, rows, setOpenId],
  );

  const act = useCallback(
    (ids: string[], action: InboxAction) => {
      if (ids.length === 0) return;
      if (action === "archive" || (action === "unarchive" && view === "archived")) moveOnFrom(ids);
      update.mutate({ ids, action });
      if (action === "archive")
        toast(t("archivedToast", { count: ids.length }), {
          action: {
            label: t("unarchive"),
            onClick: () => update.mutate({ ids, action: "unarchive" }),
          },
        });
      setSelection(new Set());
    },
    [moveOnFrom, t, update, view],
  );

  const doSnooze = useCallback(
    (ids: string[], until: Date | null) => {
      if (ids.length === 0) return;
      if (until) moveOnFrom(ids);
      snooze.mutate({ ids, until: until ? until.toISOString() : null });
      if (until)
        toast(
          t("snoozedToast", {
            time: until.toLocaleString([], {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            }),
          }),
        );
      setSelection(new Set());
    },
    [moveOnFrom, snooze, t],
  );

  // Keyboard layer (DESIGN_SYSTEM §7.1, "inbox" scope in the registry).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const id = resolveShortcut(e, ["inbox"]);
      if (!id) return;
      const mod = e.metaKey || e.ctrlKey;
      if (isTypingTarget(e.target) && (!mod || id === "inboxSelectAll")) return;
      const i = focusedId ? rows.findIndex((r) => r.id === focusedId) : -1;
      const focused = i >= 0 ? rows[i] : undefined;
      const targets = selection.size ? [...selection] : focused ? [focused.id] : [];
      const move = (delta: number) => {
        const next = rows[Math.min(rows.length - 1, Math.max(0, i + delta))];
        if (!next) return;
        e.preventDefault();
        open(next);
        listRef.current
          ?.querySelector(`[data-id="${next.id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      };
      switch (id) {
        case "inboxDown":
        case "inboxDownArrow":
          move(1);
          break;
        case "inboxUp":
        case "inboxUpArrow":
          move(-1);
          break;
        case "inboxOpen":
          if (focused) open(focused);
          break;
        case "inboxOpenFull":
          if (focused?.href) {
            e.preventDefault();
            router.push(focused.href as never);
          }
          break;
        case "inboxSelect":
          if (focused) toggleSelect(focused.id, false);
          break;
        case "inboxSelectAll":
          e.preventDefault();
          setSelection(new Set(rows.map((r) => r.id)));
          break;
        case "inboxArchive":
          if (targets.length) {
            const archived = targets.every((tid) => rows.find((r) => r.id === tid)?.archivedAt);
            act(targets, archived ? "unarchive" : "archive");
          }
          break;
        case "inboxRead": {
          if (!targets.length) break;
          const anyUnread = targets.some((tid) => !rows.find((r) => r.id === tid)?.readAt);
          act(targets, anyUnread ? "read" : "unread");
          break;
        }
        case "inboxSnooze":
          e.preventDefault();
          if (selection.size) setBulkSnoozeOpen(true);
          else if (openRow && !openRow.archivedAt) setSnoozeOpen(true);
          break;
        case "inboxClear":
          if (selection.size) setSelection(new Set());
          else if (openId) void setOpenId(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, focusedId, open, openId, openRow, router, rows, selection, setOpenId, toggleSelect]);

  const selectedRows = [...selection];
  const filterLabel = filter ? t(`filter.${filter}`) : t("filter.any");
  const unreadCount = counts?.unread ?? 0;

  return (
    <>
      <PageHeader
        crumbs={[{ label: t("title"), icon: <Inbox /> }]}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => markAll.mutate({ filter })}
              disabled={unreadCount === 0}
              data-testid="inbox-mark-all"
            >
              <CheckCheck />
              <span className="hidden sm:inline">{t("markAllRead")}</span>
            </Button>
            <Tooltip content={t("settings")}>
              <Button variant="ghost" size="icon" asChild aria-label={t("settings")}>
                <Link href={`/${ws}/settings/notifications` as never}>
                  <Settings />
                </Link>
              </Button>
            </Tooltip>
          </>
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <section
          aria-label={t("list")}
          className={cn(
            "relative flex min-h-0 w-full shrink-0 flex-col border-border md:w-[380px] md:border-r",
            openId && "hidden md:flex",
          )}
        >
          <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b border-border px-3">
            {view === "all" || view === "unread" ? (
              <SegmentedControl
                value={view}
                onValueChange={(v) => void setView(v as View)}
                label={t("viewsLabel")}
              >
                <SegmentedControlItem value="all">{t("views.all")}</SegmentedControlItem>
                <SegmentedControlItem value="unread" data-testid="inbox-unread-tab">
                  {t("views.unread")}
                  {unreadCount > 0 ? (
                    <span className="text-micro text-fg-muted tabular">{unreadCount}</span>
                  ) : null}
                </SegmentedControlItem>
              </SegmentedControl>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void setView("all")}>
                <ArrowLeft />
                {t(`views.${view}`)}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Chip
                  active={Boolean(filter)}
                  aria-label={t("filterLabel")}
                  data-testid="inbox-filter"
                >
                  <ListFilter />
                  <span className="max-w-[120px] truncate">{filterLabel}</span>
                </Chip>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60">
                <DropdownMenuRadioGroup
                  value={filter ?? "any"}
                  onValueChange={(v) => void setFilter(v === "any" ? null : (v as InboxFilter))}
                >
                  <DropdownMenuRadioItem value="any">{t("filter.any")}</DropdownMenuRadioItem>
                  {INBOX_FILTER_KEYS.map((k) => (
                    <DropdownMenuRadioItem key={k} value={k}>
                      <span className="flex-1">{t(`filter.${k}`)}</span>
                      {counts?.byFilter[k] ? (
                        <span className="text-small text-fg-muted tabular">
                          {counts.byFilter[k]}
                        </span>
                      ) : null}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label={t("moreViews")}
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {(["snoozed", "archived"] as const).map((v) => (
                  <DropdownMenuItem key={v} onSelect={() => void setView(view === v ? "all" : v)}>
                    {v === "snoozed" ? <AlarmClock /> : <Archive />}
                    <span className="flex-1">{t(`views.${v}`)}</span>
                    {view === v ? <Check /> : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => router.push(`/${ws}/settings/notifications` as never)}
                >
                  <Settings />
                  {t("settings")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
            {inbox.isError ? (
              <div className="p-4">
                <Banner
                  tone="danger"
                  title={t("errors.load")}
                  action={
                    <Button size="xs" variant="secondary" onClick={() => void inbox.refetch()}>
                      {t("retry")}
                    </Button>
                  }
                />
              </div>
            ) : inbox.isPending ? (
              <InboxRowsSkeleton />
            ) : rows.length === 0 ? (
              <EmptyState
                compact
                className="px-6 py-16"
                icon={
                  view === "snoozed" ? (
                    <AlarmClock />
                  ) : view === "archived" ? (
                    <Archive />
                  ) : (
                    <Inbox />
                  )
                }
                title={filter ? t("empty.filtered") : t(`empty.${view}`)}
                description={filter ? t("empty.filteredBody") : t(`empty.${view}Body`)}
                action={
                  filter ? (
                    <Button size="sm" variant="secondary" onClick={() => void setFilter(null)}>
                      {t("filter.any")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul
                ref={listRef}
                role="listbox"
                aria-label={t("list")}
                aria-multiselectable
                className="pb-16"
                data-testid="inbox-list"
              >
                {rows.map((row) => (
                  <InboxRowView
                    key={row.id}
                    row={row}
                    text={texts.get(row.id) ?? text(row)}
                    active={row.id === openId}
                    focused={row.id === focusedId}
                    selected={selection.has(row.id)}
                    selecting={selection.size > 0}
                    onOpen={open}
                    onToggleSelect={toggleSelect}
                    onAction={act}
                    onSnooze={doSnooze}
                  />
                ))}
                {inbox.hasNextPage ? (
                  <li className="flex justify-center p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={inbox.isFetchingNextPage}
                      onClick={() => void inbox.fetchNextPage()}
                    >
                      {t("loadMore")}
                    </Button>
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          {selectedRows.length > 0 ? (
            <div
              role="toolbar"
              aria-label={t("selected", { count: selectedRows.length })}
              data-testid="inbox-selection-bar"
              className="absolute bottom-3 left-1/2 z-[35] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-0.5 rounded-card border border-border bg-surface px-1.5 py-1 shadow-dialog"
            >
              <span className="px-2 text-body font-medium whitespace-nowrap tabular">
                {t("selected", { count: selectedRows.length })}
              </span>
              <Tooltip content={t("markRead")} shortcut="u">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("markRead")}
                  onClick={() => act(selectedRows, "read")}
                >
                  <MailOpen />
                </Button>
              </Tooltip>
              <Tooltip content={t("markUnread")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("markUnread")}
                  onClick={() => act(selectedRows, "unread")}
                >
                  <Mail />
                </Button>
              </Tooltip>
              {view !== "archived" ? (
                <SnoozeMenu
                  onSnooze={(until) => doSnooze(selectedRows, until)}
                  open={bulkSnoozeOpen}
                  onOpenChange={setBulkSnoozeOpen}
                  align="start"
                >
                  <Button variant="ghost" size="icon-sm" aria-label={t("snooze")}>
                    <AlarmClock />
                  </Button>
                </SnoozeMenu>
              ) : null}
              <Tooltip content={view === "archived" ? t("unarchive") : t("archive")} shortcut="e">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={view === "archived" ? t("unarchive") : t("archive")}
                  data-testid="inbox-bulk-archive"
                  onClick={() => act(selectedRows, view === "archived" ? "unarchive" : "archive")}
                >
                  <Archive />
                </Button>
              </Tooltip>
              <Tooltip content={t("clearSelection")} shortcut="esc">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("clearSelection")}
                  onClick={() => setSelection(new Set())}
                >
                  <X />
                </Button>
              </Tooltip>
            </div>
          ) : null}
        </section>
        <section className={cn("min-w-0 flex-1", openId ? "flex" : "hidden md:flex")}>
          <InboxReader
            ws={ws}
            row={openRow}
            onAction={act}
            onSnooze={doSnooze}
            onBack={() => void setOpenId(null)}
            snoozeOpen={snoozeOpen}
            onSnoozeOpenChange={setSnoozeOpen}
          />
        </section>
      </div>
    </>
  );
}

/** Same geometry as InboxRowView, so nothing jumps when rows arrive. */
export function InboxRowsSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <div aria-hidden className="fade-bottom">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-border py-3 pr-3 pl-5">
          <Skeleton className="mt-0.5 size-8 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3.5" style={{ width: `${40 + ((i * 29) % 35)}%` }} />
              <Skeleton className="ml-auto h-3 w-8" />
            </div>
            <Skeleton className="h-3" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Page-level fallback: header, toolbar, list skeleton and an empty reader. */
export function InboxSkeleton() {
  return (
    <>
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-3 border-b border-border px-4 md:px-5">
        <Skeleton className="size-[18px] rounded-[5px]" />
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="ml-auto h-9 w-40 rounded-control" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full shrink-0 md:w-[380px] md:border-r md:border-border">
          <div className="flex h-[var(--toolbar-height)] items-center gap-2 border-b border-border px-3">
            <Skeleton className="h-8 w-32 rounded-control" />
            <Skeleton className="h-8 w-24 rounded-chip" />
          </div>
          <InboxRowsSkeleton />
        </div>
        <div className="hidden flex-1 md:block" />
      </div>
    </>
  );
}
