"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CopyPlus,
  Ellipsis,
  FileText,
  ImageIcon,
  Link as LinkIcon,
  MessageSquareReply,
  Pencil,
  SmilePlus,
  Trash,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { RichTextView } from "@/components/editor/rich-text-view";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StateIcon } from "@/components/icons/state-icon";
import { editMessageAction } from "@/server/actions/messages";
import { unwrap, useMessageActions } from "./data";
import { useChatSources } from "./editor-sources";
import { ItemChip } from "./item-chip";
import type { ItemRefInfo, MessageView, Person } from "./types";

export const REACTIONS = ["👍", "🎉", "❤️", "👀", "🚀", "✅"];

const fmtSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * One chat message. Consecutive messages by the same person within a few
 * minutes are `compact` (no avatar or name). Hover shows react, reply in
 * thread, create work item and the ⋯ menu.
 */
export const MessageItem = memo(function MessageItem({
  ws,
  message,
  refs,
  people,
  me,
  compact,
  highlight,
  canPost,
  canModerate,
  inThread,
  onOpenThread,
  onCreateItem,
  onChanged,
}: {
  ws: string;
  message: MessageView;
  refs: Record<string, ItemRefInfo>;
  people: Person[];
  me: string;
  compact: boolean;
  highlight?: boolean;
  canPost: boolean;
  canModerate: boolean;
  /** Inside the thread panel: no thread summary, no "reply in thread". */
  inThread?: boolean;
  onOpenThread?: (rootId: string) => void;
  onCreateItem?: (message: MessageView) => void;
  onChanged?: () => void;
}) {
  const t = useTranslations("messages");
  const relative = useRelativeTime();
  const format = useFormatter();
  const { react, remove } = useMessageActions(ws);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(message.body);
  const sources = useChatSources(ws, people);
  const mine = message.author?.id === me;
  const time = format.dateTime(new Date(message.createdAt), { hour: "numeric", minute: "2-digit" });
  const fullTime = format.dateTime(new Date(message.createdAt), {
    dateStyle: "full",
    timeStyle: "short",
  });
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? t("someone");

  const saveEdit = async () => {
    try {
      await unwrap(editMessageAction(ws, { id: message.id, body: draft }));
      setEditing(false);
      onChanged?.();
    } catch {
      toast.error(t("errors.generic"));
    }
  };
  const copyLink = async () => {
    const path = message.threadRootId
      ? `/${ws}/messages/c/${message.channelId}?thread=${message.threadRootId}`
      : `/${ws}/messages/c/${message.channelId}?msg=${message.id}`;
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    toast(t("copied"));
  };

  return (
    <div
      id={`msg-${message.id}`}
      data-testid="message"
      data-message-id={message.id}
      className={cn(
        "group relative flex gap-3 px-5 transition-colors duration-[var(--dur-slow)]",
        compact ? "py-0.5" : "pt-2 pb-0.5",
        highlight ? "bg-sky-50" : "hover:bg-surface-hover",
      )}
    >
      <div className="w-8 shrink-0">
        {compact ? (
          <time
            dateTime={message.createdAt}
            title={fullTime}
            className="invisible block pt-0.5 text-right text-micro text-fg-muted tabular group-hover:visible"
          >
            {time}
          </time>
        ) : message.author ? (
          <Avatar user={message.author} size="md" className="mt-0.5" />
        ) : (
          <span className="mt-0.5 block size-8 rounded-full bg-neutral-150" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {compact ? null : (
          <div className="flex items-baseline gap-2">
            <span className="text-body font-semibold text-fg">
              {message.author?.name ?? t("someone")}
            </span>
            <time
              dateTime={message.createdAt}
              title={fullTime}
              className="text-caption text-fg-muted tabular"
            >
              {relative(message.createdAt)}
            </time>
          </div>
        )}
        {message.deleted ? (
          <p className="text-body text-fg-muted italic">{t("deletedMessage")}</p>
        ) : editing ? (
          <div
            className="my-1 rounded-card border border-border-strong bg-surface px-3 py-2 focus-within:border-focus"
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              setEditing(false);
            }}
          >
            <RichTextEditor
              value={message.body}
              onChange={setDraft}
              onSubmit={() => void saveEdit()}
              submitOnEnter
              sources={sources}
              autoFocus
              minHeight="min-h-[22px]"
            />
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <span className="mr-auto text-caption text-fg-muted">{t("editHint")}</span>
              <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                {t("cancel")}
              </Button>
              <Button size="xs" variant="primary" onClick={() => void saveEdit()}>
                {t("save")}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <RichTextView
              doc={message.body}
              className="[&_p+p]:mt-1"
              renderItemRef={({ id, label }) => <ItemChip ws={ws} item={refs[id]} label={label} />}
            />
            {message.editedAt ? (
              <span className="text-caption text-fg-muted">{t("edited")}</span>
            ) : null}
          </div>
        )}

        {message.attachments.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/v1/${ws}/files/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 max-w-[280px] items-center gap-2.5 rounded-card border border-border bg-surface px-3 hover:bg-surface-hover"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-surface-muted text-icon">
                    {a.mimeType.startsWith("image/") ? (
                      <ImageIcon className="size-4" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-small font-medium text-fg">
                      {a.filename}
                    </span>
                    <span className="block text-caption text-fg-muted tabular">
                      {fmtSize(a.size)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {message.createdItems.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.createdItems.map((item) => (
              <Link
                key={item.id}
                href={`/${ws}/i/${item.identifier}` as never}
                className="inline-flex h-7 max-w-[360px] items-center gap-1.5 rounded-chip border border-border bg-surface-muted px-2 text-small hover:bg-surface-hover"
                data-testid="created-item"
              >
                <span className="text-fg-muted">{t("createdItem")}</span>
                <StateIcon group={item.stateGroup} color={item.stateColor} size={12} />
                <span className="font-medium text-fg-muted tabular">{item.identifier}</span>
                <span className="truncate text-fg">{item.title}</span>
              </Link>
            ))}
          </div>
        ) : null}

        {message.reactions.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const reacted = r.userIds.includes(me);
              return (
                <Tooltip key={r.emoji} content={r.userIds.map(nameOf).join(", ")}>
                  <button
                    type="button"
                    disabled={!canPost}
                    onClick={() => react.mutate({ message, emoji: r.emoji, me })}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-small tabular",
                      reacted
                        ? "border-sky-200 bg-sky-50 text-sky-800"
                        : "border-border bg-surface hover:bg-surface-hover",
                    )}
                    aria-pressed={reacted}
                  >
                    <span>{r.emoji}</span>
                    {r.userIds.length}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        ) : null}

        {!inThread && message.replyCount > 0 ? (
          <button
            type="button"
            onClick={() => onOpenThread?.(message.id)}
            data-testid="thread-summary"
            className="mt-1 -ml-1.5 inline-flex h-7 items-center gap-2 rounded-chip px-1.5 text-small hover:bg-surface hover:shadow-xs"
          >
            <span className="font-medium text-link">
              {t("replies", { count: message.replyCount })}
            </span>
            {message.lastReplyAt ? (
              <span className="text-fg-muted">
                {t("lastReply", { time: relative(message.lastReplyAt) })}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      {message.deleted || editing ? null : (
        <div
          className="absolute -top-3 right-4 hidden items-center gap-0.5 rounded-control border border-border bg-surface p-0.5 shadow-xs group-focus-within:flex group-hover:flex"
          data-testid="message-actions"
        >
          {canPost ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={t("react")}>
                  <SmilePlus />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="flex gap-0.5 p-1">
                {REACTIONS.map((emoji) => (
                  <PopoverClose asChild key={emoji}>
                    <button
                      type="button"
                      aria-label={emoji}
                      className="flex size-8 items-center justify-center rounded-[8px] text-title hover:bg-neutral-150"
                      onClick={() => react.mutate({ message, emoji, me })}
                    >
                      {emoji}
                    </button>
                  </PopoverClose>
                ))}
              </PopoverContent>
            </Popover>
          ) : null}
          {!inThread && canPost ? (
            <Tooltip content={t("replyInThread")}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("replyInThread")}
                data-testid="reply-in-thread"
                onClick={() => onOpenThread?.(message.id)}
              >
                <MessageSquareReply />
              </Button>
            </Tooltip>
          ) : null}
          {onCreateItem ? (
            <Tooltip content={t("createItem")}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("createItem")}
                data-testid="create-item-from-message"
                onClick={() => onCreateItem(message)}
              >
                <CopyPlus />
              </Button>
            </Tooltip>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t("more")}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void copyLink()}>
                <LinkIcon />
                {t("copyLink")}
              </DropdownMenuItem>
              {mine && canPost ? (
                <DropdownMenuItem
                  onSelect={() => {
                    setDraft(message.body);
                    setEditing(true);
                  }}
                >
                  <Pencil />
                  {t("edit")}
                </DropdownMenuItem>
              ) : null}
              {mine || canModerate ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    onSelect={() => remove.mutate({ message, deleted: true })}
                  >
                    <Trash />
                    {t("delete")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
});
