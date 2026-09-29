"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { MailView } from "@dopl/shared/schemas/mail";
import type { ActionResult } from "@/server/action-result";
import {
  addEmailCommentAction,
  assignThreadAction,
  linkThreadAction,
  promoteThreadAction,
  replyToThreadAction,
  setThreadLabelsAction,
  setThreadStatusAction,
  snoozeThreadAction,
  unlinkThreadAction,
} from "@/server/actions/mail";
import type { MailboxSummary, ThreadDetail, ThreadPage, ThreadRow } from "./types";

export interface ThreadListParams {
  mailbox: string | null;
  view: MailView;
  q: string | null;
}

export const mailKeys = {
  all: (ws: string) => ["mail", ws] as const,
  mailboxes: (ws: string) => ["mail", ws, "mailboxes"] as const,
  lists: (ws: string) => ["mail", ws, "threads"] as const,
  list: (ws: string, p: ThreadListParams) =>
    ["mail", ws, "threads", p.mailbox, p.view, p.q] as const,
  thread: (ws: string, id: string) => ["mail", ws, "thread", id] as const,
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

function unwrap<T>(res: ActionResult<T>): T {
  if (!res.ok) throw Object.assign(new Error(res.message ?? res.error), { code: res.error });
  return res.data;
}

export function useMailboxes(ws: string, initial?: MailboxSummary[]) {
  return useQuery({
    queryKey: mailKeys.mailboxes(ws),
    queryFn: () => getJson<MailboxSummary[]>(`/api/v1/${ws}/mail/mailboxes`),
    initialData: initial,
  });
}

export function useThreads(ws: string, p: ThreadListParams, initial?: ThreadPage) {
  return useInfiniteQuery({
    queryKey: mailKeys.list(ws, p),
    queryFn: ({ pageParam }) => {
      const s = new URLSearchParams({ view: p.view });
      if (p.mailbox) s.set("mailbox", p.mailbox);
      if (p.q) s.set("q", p.q);
      if (pageParam) s.set("cursor", pageParam);
      return getJson<ThreadPage>(`/api/v1/${ws}/mail/threads?${s.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    ...(initial ? { initialData: { pages: [initial], pageParams: [null] } } : {}),
    placeholderData: (prev) => prev,
  });
}

export function useThread(ws: string, id: string | null) {
  return useQuery({
    queryKey: mailKeys.thread(ws, id ?? ""),
    queryFn: () => getJson<ThreadDetail>(`/api/v1/${ws}/mail/threads/${id ?? ""}`),
    enabled: Boolean(id),
  });
}

type Patch = Partial<Pick<ThreadRow, "status" | "assignee" | "snoozedUntil" | "labels">>;

/**
 * Thread actions, optimistic on the open thread and every cached list; the
 * server's realtime event refetches the lists (a solved thread leaves "Open").
 */
export function useThreadActions(ws: string) {
  const qc = useQueryClient();
  const t = useTranslations("mail.errors");

  const patchCaches = (id: string, patch: Patch) => {
    const snapshots: Array<[readonly unknown[], unknown]> = [];
    for (const [key, data] of qc.getQueriesData<InfiniteData<ThreadPage>>({
      queryKey: mailKeys.lists(ws),
    })) {
      if (!data) continue;
      snapshots.push([key, data]);
      qc.setQueryData<InfiniteData<ThreadPage>>(key, {
        ...data,
        pages: data.pages.map((pg) => ({
          ...pg,
          rows: pg.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),
      });
    }
    const one = qc.getQueryData<ThreadDetail>(mailKeys.thread(ws, id));
    if (one) {
      snapshots.push([mailKeys.thread(ws, id), one]);
      qc.setQueryData<ThreadDetail>(mailKeys.thread(ws, id), { ...one, ...patch });
    }
    return snapshots;
  };
  const rollback = (snapshots?: Array<[readonly unknown[], unknown]>) => {
    for (const [key, data] of snapshots ?? []) qc.setQueryData(key, data);
  };
  const onError = (err: unknown) => {
    const code = (err as { code?: string })?.code;
    toast.error(
      code === "assignee_cannot_read"
        ? t("assigneeCannotRead")
        : code === "forbidden"
          ? t("forbidden")
          : t("generic"),
    );
  };
  const refresh = (id: string) => {
    void qc.invalidateQueries({ queryKey: mailKeys.lists(ws) });
    void qc.invalidateQueries({ queryKey: mailKeys.thread(ws, id) });
    void qc.invalidateQueries({ queryKey: mailKeys.mailboxes(ws) });
  };

  return {
    setStatus: useMutation({
      mutationFn: async (i: { threadId: string; status: ThreadRow["status"] }) =>
        unwrap(await setThreadStatusAction(ws, i)),
      onMutate: (i) => ({
        snapshots: patchCaches(i.threadId, {
          status: i.status,
          ...(i.status !== "OPEN" ? { snoozedUntil: null } : {}),
        }),
      }),
      onError: (err, _i, c) => {
        rollback(c?.snapshots);
        onError(err);
      },
      onSettled: (_r, _e, i) => refresh(i.threadId),
    }),
    assign: useMutation({
      mutationFn: async (i: { threadId: string; assignee: ThreadRow["assignee"] }) =>
        unwrap(
          await assignThreadAction(ws, {
            threadId: i.threadId,
            assigneeId: i.assignee?.id ?? null,
          }),
        ),
      onMutate: (i) => ({ snapshots: patchCaches(i.threadId, { assignee: i.assignee }) }),
      onError: (err, _i, c) => {
        rollback(c?.snapshots);
        onError(err);
      },
      onSettled: (_r, _e, i) => refresh(i.threadId),
    }),
    snooze: useMutation({
      mutationFn: async (i: { threadId: string; until: string | null }) =>
        unwrap(await snoozeThreadAction(ws, i)),
      onMutate: (i) => ({ snapshots: patchCaches(i.threadId, { snoozedUntil: i.until }) }),
      onError: (err, _i, c) => {
        rollback(c?.snapshots);
        onError(err);
      },
      onSettled: (_r, _e, i) => refresh(i.threadId),
    }),
    labels: useMutation({
      mutationFn: async (i: { threadId: string; labelIds: string[]; create?: string[] }) =>
        unwrap(await setThreadLabelsAction(ws, i)),
      onError,
      onSettled: (_r, _e, i) => refresh(i.threadId),
    }),
    comment: useMutation({
      mutationFn: async (i: { threadId: string; body: unknown }) =>
        unwrap(await addEmailCommentAction(ws, i)),
      onError,
      onSettled: (_r, _e, i) => refresh(i.threadId),
    }),
    reply: useMutation({
      mutationFn: async (i: { threadId: string; body: unknown; replyAll: boolean }) =>
        unwrap(await replyToThreadAction(ws, i)),
      onError: (err) => {
        const code = (err as { code?: string })?.code;
        if (code === "send_disabled") toast.error(t("sendDisabled"));
        else onError(err);
      },
      onSettled: (_r, _e, i) => refresh(i.threadId),
    }),
    promote: useMutation({
      mutationFn: async (i: { threadId: string; projectId: string; title: string }) =>
        unwrap(await promoteThreadAction(ws, i)),
      onError,
      onSettled: (_r, _e, i) => refresh(i.threadId),
    }),
    link: useMutation({
      mutationFn: async (i: { threadId: string; item: string }) =>
        unwrap(await linkThreadAction(ws, i)),
      onError,
      onSettled: (_r, _e, i) => refresh(i.threadId),
    }),
    unlink: useMutation({
      mutationFn: async (i: { threadId: string; workItemId: string }) =>
        unwrap(await unlinkThreadAction(ws, i)),
      onError,
      onSettled: (_r, _e, i) => refresh(i.threadId),
    }),
  };
}
