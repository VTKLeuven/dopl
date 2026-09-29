"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Banner } from "@/components/ui/banner";
import { Skeleton } from "@/components/ui/skeleton";
import { markThreadReadAction } from "@/server/actions/messages";
import { useChannel, usePeople, useThread } from "./data";
import { MessageItem } from "./message-item";

/**
 * A chat message in the Inbox reader: the thread it belongs to (or the
 * message on its own), with the one the notification is about highlighted.
 */
export function ThreadPreview({
  ws,
  rootId,
  highlightId,
}: {
  ws: string;
  rootId: string;
  highlightId: string | null;
}) {
  const t = useTranslations("messages");
  const qc = useQueryClient();
  const thread = useThread(ws, rootId);
  const channel = useChannel(ws, thread.data?.root.channelId ?? "");
  const people = usePeople(ws).data ?? [];
  useEffect(() => {
    if (!thread.data || thread.data.replies.length === 0) return;
    void markThreadReadAction(ws, rootId).then(() =>
      qc.invalidateQueries({ queryKey: ["inbox", ws] }),
    );
  }, [ws, rootId, thread.data, qc]);

  if (thread.isError || channel.isError)
    return (
      <div className="p-6">
        <Banner tone="warning" title={t("errors.thread")} />
      </div>
    );
  if (!thread.data || !channel.data)
    return (
      <div className="flex flex-col gap-3 p-6" aria-hidden>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  const c = channel.data;
  const dm = c.kind === "DM" || c.kind === "GROUP_DM";
  const { root, replies, refs } = thread.data;
  return (
    <div className="h-full scrollbar-thin overflow-y-auto py-4" data-testid="thread-preview">
      <p className="px-5 pb-2 text-small font-medium text-fg-muted">{dm ? c.name : `#${c.name}`}</p>
      {[root, ...replies].map((m) => (
        <MessageItem
          key={m.id}
          ws={ws}
          message={m}
          refs={refs}
          people={people}
          me={c.me}
          compact={false}
          highlight={m.id === highlightId}
          canPost={c.can.post}
          canModerate={c.can.manage}
          inThread
        />
      ))}
    </div>
  );
}
