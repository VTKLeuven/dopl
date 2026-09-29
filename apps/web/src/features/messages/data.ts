"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { uuidv7 } from "@dopl/shared/ids";
import type { ActionResult } from "@/server/action-result";
import {
  markChannelReadAction,
  sendMessageAction,
  setMessageDeletedAction,
  toggleMessageReactionAction,
} from "@/server/actions/messages";
import { chatKeys } from "./keys";
import type {
  BrowsableChannel,
  ChannelDetail,
  ChannelList,
  MessagePage,
  MessageView,
  Person,
  ThreadView,
} from "./types";

export { chatKeys };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const res = await p;
  if (!res.ok) throw new Error(res.message ?? res.error);
  return res.data;
}

export function useChannels(ws: string, key: "page" | "dot" = "page") {
  return useQuery({
    queryKey: key === "dot" ? chatKeys.channelsDot(ws) : chatKeys.channels(ws),
    queryFn: () => getJson<ChannelList>(`/api/v1/${ws}/channels`),
    staleTime: 60_000,
  });
}

export function useChannel(ws: string, channelId: string) {
  return useQuery({
    queryKey: chatKeys.channel(ws, channelId),
    queryFn: () => getJson<ChannelDetail>(`/api/v1/${ws}/channels/${channelId}`),
    enabled: Boolean(channelId),
  });
}

export function useMessages(ws: string, channelId: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(ws, channelId),
    queryFn: ({ pageParam }) =>
      getJson<MessagePage>(
        `/api/v1/${ws}/channels/${channelId}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: null as string | null,
    // Pages go back in time: the next page is older.
    getNextPageParam: (last) => last.older,
    enabled: Boolean(channelId),
  });
}

export function useThread(ws: string, rootId: string | null) {
  return useQuery({
    queryKey: chatKeys.thread(ws, rootId ?? ""),
    queryFn: () => getJson<ThreadView>(`/api/v1/${ws}/threads/${rootId}`),
    enabled: Boolean(rootId),
  });
}

export function usePeople(ws: string) {
  return useQuery({
    queryKey: chatKeys.people(ws),
    queryFn: () => getJson<Person[]>(`/api/v1/${ws}/people`),
    staleTime: 5 * 60_000,
  });
}

export function useBrowseChannels(ws: string, enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.browse(ws),
    queryFn: () => getJson<BrowsableChannel[]>(`/api/v1/${ws}/channels/browse`),
    enabled,
    staleTime: 0,
  });
}

/* ───────────── mutations ───────────── */

export interface SendInput {
  channelId: string;
  threadRootId: string | null;
  body: unknown;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number }>;
}

function optimisticMessage(
  id: string,
  input: SendInput,
  me: Pick<Person, "id" | "name" | "image" | "kind"> | null,
): MessageView {
  return {
    id,
    channelId: input.channelId,
    threadRootId: input.threadRootId,
    kind: "USER",
    agentRunId: null,
    author: me,
    body: input.body,
    deleted: false,
    createdAt: new Date().toISOString(),
    editedAt: null,
    replyCount: 0,
    lastReplyAt: null,
    reactions: [],
    attachments: input.attachments,
    createdItems: [],
  };
}

/**
 * Sending shows the message immediately (client id = server id), then
 * reconciles; a failure takes it back out and says so.
 */
export function useSendMessage(
  ws: string,
  me: Pick<Person, "id" | "name" | "image" | "kind"> | null,
) {
  const qc = useQueryClient();
  const t = useTranslations("messages");
  return useMutation({
    mutationFn: (v: SendInput & { clientId: string }) =>
      unwrap(
        sendMessageAction(ws, {
          channelId: v.channelId,
          threadRootId: v.threadRootId,
          body: v.body,
          attachmentIds: v.attachments.map((a) => a.id),
          clientId: v.clientId,
        }),
      ),
    onMutate: async (v) => {
      const msg = optimisticMessage(v.clientId, v, me);
      if (v.threadRootId) {
        const key = chatKeys.thread(ws, v.threadRootId);
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<ThreadView>(key);
        if (prev)
          qc.setQueryData<ThreadView>(key, {
            ...prev,
            replies: [...prev.replies, msg],
            root: { ...prev.root, replyCount: prev.root.replyCount + 1 },
          });
      } else {
        const key = chatKeys.messages(ws, v.channelId);
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<InfiniteData<MessagePage>>(key);
        const first = prev?.pages[0];
        if (prev && first)
          qc.setQueryData<InfiniteData<MessagePage>>(key, {
            ...prev,
            pages: [{ ...first, messages: [...first.messages, msg] }, ...prev.pages.slice(1)],
          });
      }
    },
    onError: () => toast.error(t("errors.send")),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(ws, v.channelId) });
      if (v.threadRootId)
        void qc.invalidateQueries({ queryKey: chatKeys.thread(ws, v.threadRootId) });
    },
  });
}

export const newClientId = () => uuidv7();

export function useMessageActions(ws: string) {
  const qc = useQueryClient();
  const t = useTranslations("messages");
  const refresh = (m: Pick<MessageView, "channelId" | "threadRootId" | "id">) => {
    void qc.invalidateQueries({ queryKey: chatKeys.messages(ws, m.channelId) });
    void qc.invalidateQueries({ queryKey: chatKeys.thread(ws, m.threadRootId ?? m.id) });
  };
  const react = useMutation({
    mutationFn: (v: { message: MessageView; emoji: string; me: string }) =>
      unwrap(toggleMessageReactionAction(ws, { messageId: v.message.id, emoji: v.emoji })),
    onError: () => toast.error(t("errors.generic")),
    onSettled: (_d, _e, v) => refresh(v.message),
  });
  const remove = useMutation({
    mutationFn: (v: { message: MessageView; deleted: boolean }) =>
      unwrap(setMessageDeletedAction(ws, v.message.id, v.deleted)),
    onSuccess: (_d, v) => {
      if (v.deleted)
        toast(t("deleted"), {
          action: {
            label: t("undo"),
            onClick: () => remove.mutate({ message: v.message, deleted: false }),
          },
        });
    },
    onError: () => toast.error(t("errors.generic")),
    onSettled: (_d, _e, v) => refresh(v.message),
  });
  return { react, remove };
}

/** Reading moves lastReadAt forward; the sidebar count drops at once. */
export function useMarkRead(ws: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { channelId: string; at: string }) =>
      unwrap(markChannelReadAction(ws, { channelId: v.channelId, at: v.at })),
    onMutate: (v) => {
      const clear = (items: ChannelList["channels"]) =>
        items.map((c) => (c.id === v.channelId ? { ...c, unread: 0, mentions: 0 } : c));
      for (const key of [chatKeys.channels(ws), chatKeys.channelsDot(ws)]) {
        const list = qc.getQueryData<ChannelList>(key);
        if (list)
          qc.setQueryData<ChannelList>(key, {
            projects: clear(list.projects),
            channels: clear(list.channels),
            dms: clear(list.dms),
          });
      }
    },
    // Mentions read here leave the Inbox too.
    onSettled: () => qc.invalidateQueries({ queryKey: ["inbox", ws] }),
  });
}
