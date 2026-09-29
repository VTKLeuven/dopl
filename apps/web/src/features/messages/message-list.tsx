"use client";

import { Fragment, useEffect, useMemo, useRef } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Hash } from "lucide-react";
import { isSameDay, subDays } from "date-fns";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useMessages } from "./data";
import { MessageItem } from "./message-item";
import type { ChannelDetail, ItemRefInfo, MessageView, Person } from "./types";

const GROUP_MS = 5 * 60_000;

/**
 * The channel's top-level messages. The scroller is `column-reverse`, so it
 * sits at the newest message and stays there as messages arrive, while
 * older pages load above without moving what you're reading.
 */
export function MessageList({
  ws,
  channel,
  people,
  highlightId,
  unreadAfter,
  onOpenThread,
  onCreateItem,
}: {
  ws: string;
  channel: ChannelDetail;
  people: Person[];
  highlightId: string | null;
  /** lastReadAt when the channel was opened: the "New" divider goes after it. */
  unreadAfter: string | null;
  onOpenThread: (rootId: string) => void;
  onCreateItem?: (message: MessageView) => void;
}) {
  const t = useTranslations("messages");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const q = useMessages(ws, channel.id);
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const { messages, refs } = useMemo(() => {
    const pages = q.data?.pages ?? [];
    const seen = new Set<string>();
    const all: MessageView[] = [];
    const refs: Record<string, ItemRefInfo> = {};
    // Pages are newest first; each page is oldest → newest.
    for (const page of [...pages].reverse()) {
      Object.assign(refs, page.refs);
      for (const m of page.messages) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        all.push(m);
      }
    }
    return { messages: all, refs };
  }, [q.data]);

  // Older pages load when the top of the list scrolls into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scroller.current, rootMargin: "400px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // A linked message (?msg=…) scrolls into view once it's loaded.
  const found = Boolean(highlightId && messages.some((m) => m.id === highlightId));
  useEffect(() => {
    if (!found || !highlightId) return;
    document.getElementById(`msg-${highlightId}`)?.scrollIntoView({ block: "center" });
  }, [found, highlightId]);

  if (q.isError)
    return (
      <div className="flex-1 p-5">
        <Banner
          tone="danger"
          title={t("errors.load")}
          action={
            <Button size="xs" variant="secondary" onClick={() => void q.refetch()}>
              {t("retry")}
            </Button>
          }
        />
      </div>
    );
  if (q.isPending) return <MessagesSkeleton />;

  const dayLabel = (d: Date) =>
    isSameDay(d, now)
      ? t("today")
      : isSameDay(d, subDays(now, 1))
        ? t("yesterday")
        : format.dateTime(d, { weekday: "long", day: "numeric", month: "long" });
  const unreadIndex = unreadAfter
    ? messages.findIndex((m) => m.createdAt > unreadAfter && m.author?.id !== channel.me)
    : -1;

  const rows = messages.map((m, i) => {
    const prev = messages[i - 1];
    const at = new Date(m.createdAt);
    const newDay = !prev || !isSameDay(new Date(prev.createdAt), at);
    const compact =
      !newDay &&
      i !== unreadIndex &&
      Boolean(prev) &&
      prev?.author?.id === m.author?.id &&
      !prev?.deleted &&
      at.getTime() - new Date(prev?.createdAt ?? 0).getTime() < GROUP_MS;
    return (
      <Fragment key={m.id}>
        {newDay ? (
          <div className="relative my-3 flex items-center justify-center" role="separator">
            <span className="absolute inset-x-5 top-1/2 h-px bg-border" />
            <span className="relative rounded-full border border-border bg-surface px-3 py-0.5 text-caption font-medium text-fg-secondary">
              {dayLabel(at)}
            </span>
          </div>
        ) : null}
        {i === unreadIndex ? (
          <div className="relative my-1 flex items-center px-5" data-testid="unread-divider">
            <span className="h-px flex-1 bg-danger/40" />
            <span className="ml-2 text-caption font-semibold text-danger-text">
              {t("newMessages")}
            </span>
          </div>
        ) : null}
        <MessageItem
          ws={ws}
          message={m}
          refs={refs}
          people={people}
          me={channel.me}
          compact={compact}
          highlight={m.id === highlightId}
          canPost={channel.can.post}
          canModerate={channel.can.manage}
          onOpenThread={onOpenThread}
          onCreateItem={onCreateItem}
        />
      </Fragment>
    );
  });

  return (
    <div
      ref={scroller}
      className="flex min-h-0 flex-1 scrollbar-thin flex-col-reverse overflow-y-auto"
      data-testid="message-list"
    >
      <div className="flex flex-col pt-2 pb-3">
        <div ref={sentinel} className="h-px" />
        {hasNextPage ? (
          <div className="flex justify-center py-3">{isFetchingNextPage ? <Spinner /> : null}</div>
        ) : (
          <ChannelIntro channel={channel} />
        )}
        {rows}
      </div>
    </div>
  );
}

function ChannelIntro({ channel }: { channel: ChannelDetail }) {
  const t = useTranslations("messages");
  const dm = channel.kind === "DM" || channel.kind === "GROUP_DM";
  return (
    <EmptyState
      compact
      className="items-start px-5 pt-10 pb-4 text-left"
      icon={<Hash />}
      title={
        dm ? t("intro.dmTitle", { name: channel.name }) : t("intro.title", { name: channel.name })
      }
      description={
        dm
          ? t("intro.dm")
          : channel.kind === "PROJECT"
            ? t("intro.project", { name: channel.name })
            : (channel.description ?? t("intro.custom"))
      }
    />
  );
}

/** Same rhythm as real messages: avatar, name line, one or two text lines. */
export function MessagesSkeleton() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-hidden px-5 pb-4"
      aria-hidden
    >
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
            <div className="flex gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3.5" style={{ width: `${35 + ((i * 23) % 50)}%` }} />
            {i % 3 === 0 ? <Skeleton className="h-3.5 w-1/3" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
