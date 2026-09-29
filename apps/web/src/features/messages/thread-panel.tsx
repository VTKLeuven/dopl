"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Bell, BellOff, X } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { markThreadReadAction, setThreadFollowAction } from "@/server/actions/messages";
import { chatKeys, unwrap, useThread } from "./data";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";
import { TypingLine } from "./typing-line";
import type { ChannelDetail, MessageView, Person } from "./types";

/**
 * Right-hand thread panel: the root message, every reply and a composer.
 * Opening it reads the thread (its replies and mentions leave the Inbox).
 */
export function ThreadPanel({
  ws,
  channel,
  rootId,
  people,
  me,
  highlightId,
  onClose,
  onCreateItem,
}: {
  ws: string;
  channel: ChannelDetail;
  rootId: string;
  people: Person[];
  me: Person | null;
  highlightId: string | null;
  onClose: () => void;
  onCreateItem?: (message: MessageView) => void;
}) {
  const t = useTranslations("messages");
  const qc = useQueryClient();
  const { data, isError, isPending } = useThread(ws, rootId);
  const replyCount = data?.replies.length ?? 0;

  useEffect(() => {
    void markThreadReadAction(ws, rootId).then(() =>
      qc.invalidateQueries({ queryKey: ["inbox", ws] }),
    );
  }, [ws, rootId, replyCount, qc]);

  return (
    <aside
      aria-label={t("thread")}
      data-testid="thread-panel"
      className="absolute inset-0 z-[30] flex min-h-0 flex-col border-l border-border bg-surface lg:static lg:w-[420px] lg:shrink-0"
    >
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-border px-4">
        <div className="min-w-0 flex-1">
          <p className="text-nav font-medium text-fg">{t("thread")}</p>
          <p className="truncate text-caption text-fg-muted">
            {channel.kind === "DM" || channel.kind === "GROUP_DM"
              ? channel.name
              : `#${channel.name}`}
          </p>
        </div>
        {data ? (
          <Tooltip content={data.following ? t("unfollow") : t("follow")}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={data.following ? t("unfollow") : t("follow")}
              onClick={async () => {
                await unwrap(setThreadFollowAction(ws, { rootId, follow: !data.following }));
                void qc.invalidateQueries({ queryKey: chatKeys.thread(ws, rootId) });
              }}
            >
              {data.following ? <Bell className="text-sky-700!" /> : <BellOff />}
            </Button>
          </Tooltip>
        ) : null}
        <Tooltip content={t("closeThread")} shortcut="esc">
          <Button variant="ghost" size="icon-sm" aria-label={t("closeThread")} onClick={onClose}>
            <X />
          </Button>
        </Tooltip>
      </div>
      {isError ? (
        <div className="p-4">
          <Banner tone="warning" title={t("errors.thread")} />
        </div>
      ) : isPending || !data ? (
        <div className="flex flex-col gap-3 p-5" aria-hidden>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto pb-3">
            <MessageItem
              ws={ws}
              message={data.root}
              refs={data.refs}
              people={people}
              me={channel.me}
              compact={false}
              highlight={data.root.id === highlightId}
              canPost={channel.can.post}
              canModerate={channel.can.manage}
              inThread
              onCreateItem={onCreateItem}
            />
            <div className="my-2 flex items-center gap-3 px-5">
              <span className="text-caption font-medium text-fg-muted tabular">
                {t("replies", { count: data.replies.length })}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {data.replies.map((r, i) => {
              const prev = data.replies[i - 1];
              const compact =
                Boolean(prev) &&
                prev?.author?.id === r.author?.id &&
                new Date(r.createdAt).getTime() - new Date(prev?.createdAt ?? 0).getTime() <
                  5 * 60_000;
              return (
                <MessageItem
                  key={r.id}
                  ws={ws}
                  message={r}
                  refs={data.refs}
                  people={people}
                  me={channel.me}
                  compact={compact}
                  highlight={r.id === highlightId}
                  canPost={channel.can.post}
                  canModerate={channel.can.manage}
                  inThread
                  onCreateItem={onCreateItem}
                />
              );
            })}
          </div>
          {channel.can.post && !data.root.deleted ? (
            <div className="shrink-0 px-4 pb-4">
              <TypingLine ws={ws} channelId={channel.id} threadRootId={rootId} me={channel.me} />
              <Composer
                ws={ws}
                channelId={channel.id}
                threadRootId={rootId}
                people={people}
                me={me}
                placeholder={t("replyPlaceholder")}
                autoFocus
              />
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}
