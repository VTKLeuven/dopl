"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlarmClock,
  AlarmClockOff,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowUpRight,
  Inbox,
  Mail,
  MailOpen,
} from "lucide-react";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { ItemDetail } from "@/features/work-items/item-detail";
import { ThreadPreview } from "@/features/messages/thread-preview";
import { AgentRunPane } from "@/features/agent/run-pane";
import type { InboxAction, InboxRow } from "./data";
import { useNotificationText } from "./notification-text";
import { SnoozeMenu } from "./snooze-menu";

type Kind = "message" | "request" | "item" | "approval" | "other";

function kindOf(row: InboxRow): Kind {
  if (row.type === "AGENT_APPROVAL_REQUESTED" && typeof row.data.runId === "string")
    return "approval";
  if (row.messageId && typeof row.data.channelId === "string") return "message";
  // A submitter's own request: guests may not open the item itself.
  if (row.type === "INTAKE_UPDATED" || (row.type === "COMMENT" && row.entityType === "INTAKE_ITEM"))
    return "request";
  if (row.itemRef) return "item";
  return "other";
}

/**
 * Right pane of the Inbox: the notification's actions on top, the thing it
 * is about below: the work item (same detail as the peek), the chat thread,
 * or a short card with a link.
 */
export function InboxReader({
  ws,
  row,
  onAction,
  onSnooze,
  onBack,
  snoozeOpen,
  onSnoozeOpenChange,
}: {
  ws: string;
  row: InboxRow | null;
  onAction: (ids: string[], action: InboxAction) => void;
  onSnooze: (ids: string[], until: Date | null) => void;
  onBack: () => void;
  snoozeOpen: boolean;
  onSnoozeOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("inbox");
  const text = useNotificationText();
  const relative = useRelativeTime();
  if (!row)
    return (
      <div className="flex flex-1 items-center justify-center p-8" data-testid="inbox-reader-empty">
        <EmptyState
          icon={<Inbox />}
          title={t("reader.emptyTitle")}
          description={t("reader.empty")}
        />
      </div>
    );
  const kind = kindOf(row);
  const x = text(row);
  const unread = !row.readAt;
  const snoozed = Boolean(row.snoozedUntil && new Date(row.snoozedUntil) > new Date());
  const openLabel =
    kind === "message"
      ? t("openMessages")
      : kind === "approval"
        ? t("openRun")
        : kind === "request"
          ? t("openRequest")
          : row.type === "INTAKE_SUBMITTED" || row.type === "SNOOZE_ENDED"
            ? t("openIntake")
            : kind === "item"
              ? t("openItem")
              : t("open");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="inbox-reader">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 md:px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label={t("backToInbox")}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <p className="min-w-0 flex-1 truncate text-small text-fg-muted">
          <span className="font-medium text-fg-secondary">{x.summary}</span>
          <span className="tabular"> · {relative(row.createdAt)}</span>
        </p>
        <Tooltip content={unread ? t("markRead") : t("markUnread")} shortcut="u">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={unread ? t("markRead") : t("markUnread")}
            onClick={() => onAction([row.id], unread ? "read" : "unread")}
          >
            {unread ? <MailOpen /> : <Mail />}
          </Button>
        </Tooltip>
        {snoozed ? (
          <Tooltip content={t("unsnooze")}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("unsnooze")}
              onClick={() => onSnooze([row.id], null)}
            >
              <AlarmClockOff />
            </Button>
          </Tooltip>
        ) : row.archivedAt ? null : (
          <SnoozeMenu
            onSnooze={(until) => onSnooze([row.id], until)}
            open={snoozeOpen}
            onOpenChange={onSnoozeOpenChange}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("snooze")}
              data-testid="reader-snooze"
            >
              <AlarmClock />
            </Button>
          </SnoozeMenu>
        )}
        <Tooltip content={row.archivedAt ? t("unarchive") : t("archive")} shortcut="e">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={row.archivedAt ? t("unarchive") : t("archive")}
            onClick={() => onAction([row.id], row.archivedAt ? "unarchive" : "archive")}
          >
            {row.archivedAt ? <ArchiveRestore /> : <Archive />}
          </Button>
        </Tooltip>
        {row.href ? (
          <Button variant="secondary" size="sm" asChild>
            <Link href={row.href as never} data-testid="reader-open">
              {openLabel}
              <ArrowUpRight />
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {kind === "approval" ? (
          <AgentRunPane key={row.id} ws={ws} runId={String(row.data.runId)} />
        ) : kind === "item" && row.itemRef ? (
          <ItemDetail key={row.itemRef} ws={ws} itemRef={row.itemRef} mode="peek" />
        ) : kind === "message" ? (
          <ThreadPreview
            key={row.id}
            ws={ws}
            rootId={
              typeof row.data.threadRootId === "string"
                ? row.data.threadRootId
                : (row.messageId ?? "")
            }
            highlightId={row.messageId}
          />
        ) : (
          <div className="mx-auto flex max-w-[560px] flex-col gap-3 px-6 py-10">
            {x.context ? <p className="text-small font-medium text-fg-muted">{x.context}</p> : null}
            <h2 className="text-title-lg font-semibold text-fg">{x.title}</h2>
            <p className="text-body text-fg-secondary">{x.summary}</p>
            {x.excerpt ? (
              <blockquote className="border-l-2 border-border-strong pl-3 text-body text-fg-secondary">
                {x.excerpt}
              </blockquote>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
