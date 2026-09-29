"use client";

import { memo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlarmClock, Archive, ArchiveRestore, Mail, MailOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import type { InboxAction, InboxRow as Row } from "./data";
import { TypeGlyph, type NotificationText } from "./notification-text";
import { SnoozeMenu } from "./snooze-menu";

/**
 * One notification in the list (DESIGN_SYSTEM §4.6): avatar with a type
 * glyph, title with its context, who did what, time. Unread rows are bold
 * with a sky dot. Hover shows quick actions; the checkbox takes the
 * avatar's place while selecting.
 */
export const InboxRowView = memo(function InboxRowView({
  row,
  text,
  active,
  focused,
  selected,
  selecting,
  onOpen,
  onToggleSelect,
  onAction,
  onSnooze,
}: {
  row: Row;
  text: NotificationText;
  active: boolean;
  focused: boolean;
  selected: boolean;
  selecting: boolean;
  onOpen: (row: Row) => void;
  onToggleSelect: (id: string, range: boolean) => void;
  onAction: (ids: string[], action: InboxAction) => void;
  onSnooze: (ids: string[], until: Date | null) => void;
}) {
  const t = useTranslations("inbox");
  const relative = useRelativeTime();
  const format = useFormatter();
  const full = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const unread = !row.readAt;
  const snoozed = row.snoozedUntil && new Date(row.snoozedUntil) > new Date();
  return (
    <li
      role="option"
      aria-selected={active}
      data-testid="inbox-row"
      data-unread={unread ? "true" : undefined}
      data-id={row.id}
      className={cn(
        "group relative flex cursor-pointer gap-3 border-b border-border py-3 pr-3 pl-5 transition-colors duration-[var(--dur-fast)]",
        active || selected ? "bg-surface-selected" : "hover:bg-surface-hover",
        focused && "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-sky-600",
      )}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || selecting) onToggleSelect(row.id, e.shiftKey);
        else onOpen(row);
      }}
    >
      {unread ? (
        <span
          aria-label={t("unreadDot")}
          className="absolute top-[22px] left-2 size-1.5 rounded-full bg-sky-600"
        />
      ) : null}
      <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center">
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            (selecting || selected) && "invisible",
            !selecting && "group-hover:invisible",
          )}
        >
          {row.actor ? (
            <Avatar user={row.actor} size="md" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-neutral-150">
              <TypeGlyph row={row} />
            </span>
          )}
          {row.actor ? (
            <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-surface ring-1 ring-border">
              <TypeGlyph row={row} />
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            selecting || selected ? "visible" : "invisible group-hover:visible",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            aria-label={t("select")}
            onCheckedChange={() => onToggleSelect(row.id, false)}
          />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {text.context ? (
            <span className="shrink-0 text-small font-medium text-fg-muted tabular">
              {text.context}
            </span>
          ) : null}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-body",
              unread ? "font-semibold text-fg" : "text-fg-secondary",
            )}
          >
            {text.title}
          </span>
          <time
            dateTime={row.createdAt}
            title={full(row.createdAt)}
            className="shrink-0 text-caption text-fg-muted tabular group-hover:invisible"
          >
            {relative(row.createdAt)}
          </time>
        </div>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-small text-fg-muted">
          <span className="truncate">
            {text.summary}
            {text.excerpt ? <span className="text-fg-placeholder">: {text.excerpt}</span> : null}
          </span>
          {text.count > 1 ? (
            <span className="shrink-0 rounded-full bg-neutral-150 px-1.5 text-micro font-semibold text-fg-muted tabular">
              {t("updates", { count: text.count })}
            </span>
          ) : null}
        </p>
        {snoozed && row.snoozedUntil ? (
          <p className="mt-1 inline-flex items-center gap-1 text-caption text-warning-text">
            <AlarmClock className="size-3" />
            {t("snoozedUntil", { time: full(row.snoozedUntil) })}
          </p>
        ) : null}
      </div>
      {/* Quick actions replace the time on hover. */}
      <div
        className="absolute top-2 right-2 hidden items-center gap-0.5 rounded-control border border-border bg-surface p-0.5 shadow-xs group-hover:flex"
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip content={unread ? t("markRead") : t("markUnread")} shortcut="u">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={unread ? t("markRead") : t("markUnread")}
            onClick={() => onAction([row.id], unread ? "read" : "unread")}
          >
            {unread ? <MailOpen /> : <Mail />}
          </Button>
        </Tooltip>
        {row.archivedAt ? null : (
          <SnoozeMenu onSnooze={(until) => onSnooze([row.id], until)}>
            <Button variant="ghost" size="icon-xs" aria-label={t("snooze")}>
              <AlarmClock />
            </Button>
          </SnoozeMenu>
        )}
        <Tooltip content={row.archivedAt ? t("unarchive") : t("archive")} shortcut="e">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={row.archivedAt ? t("unarchive") : t("archive")}
            data-testid="inbox-archive"
            onClick={() => onAction([row.id], row.archivedAt ? "unarchive" : "archive")}
          >
            {row.archivedAt ? <ArchiveRestore /> : <Archive />}
          </Button>
        </Tooltip>
      </div>
    </li>
  );
});
