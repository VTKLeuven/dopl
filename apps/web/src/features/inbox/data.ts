"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { INBOX_FILTERS, type InboxFilter, type InboxView } from "@dopl/shared/schemas/inbox";
import type { ActionResult } from "@/server/action-result";
import type { InboxCounts, InboxPage, InboxRow } from "@/server/queries/inbox";
import {
  markAllReadAction,
  snoozeNotificationsAction,
  updateNotificationsAction,
} from "@/server/actions/inbox";
import { inboxKeys } from "./keys";

export { inboxKeys };
export type { InboxCounts, InboxPage, InboxRow };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export function inboxUrl(ws: string, view: InboxView, filter: InboxFilter | null, cursor?: string) {
  const qs = new URLSearchParams({ view });
  if (filter) qs.set("filter", filter);
  if (cursor) qs.set("cursor", cursor);
  return `/api/v1/${ws}/inbox?${qs.toString()}`;
}

export function useInbox(ws: string, view: InboxView, filter: InboxFilter | null) {
  return useInfiniteQuery({
    queryKey: inboxKeys.list(ws, view, filter),
    queryFn: ({ pageParam }) =>
      getJson<InboxPage>(inboxUrl(ws, view, filter, pageParam ?? undefined)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    placeholderData: (prev) => prev,
  });
}

/** Badge counts: sidebar, tab title and the type filter. Kept fresh by realtime. */
export function useInboxCounts(ws: string, key: "page" | "badge" = "page") {
  return useQuery({
    queryKey: key === "badge" ? inboxKeys.badge(ws) : inboxKeys.counts(ws),
    queryFn: () => getJson<InboxCounts>(`/api/v1/${ws}/inbox/counts`),
    staleTime: 60_000,
  });
}

/* ───────────── optimistic helpers ───────────── */

type Snapshot = Array<[readonly unknown[], unknown]>;
type Patch = Partial<Pick<InboxRow, "readAt" | "archivedAt" | "snoozedUntil">>;

/** Does this row still belong in the list after the patch? */
function belongs(view: InboxView, row: InboxRow): boolean {
  const snoozed = row.snoozedUntil !== null && new Date(row.snoozedUntil) > new Date();
  switch (view) {
    case "unread":
      return !row.archivedAt && !snoozed && !row.readAt;
    case "all":
      return !row.archivedAt && !snoozed;
    case "snoozed":
      return !row.archivedAt && snoozed;
    case "archived":
      return Boolean(row.archivedAt);
  }
}

function patchLists(qc: QueryClient, ws: string, ids: Set<string> | "all", patch: Patch): Snapshot {
  const snapshot: Snapshot = [];
  for (const [key, data] of qc.getQueriesData<InfiniteData<InboxPage>>({
    queryKey: [...inboxKeys.all(ws), "list"],
  })) {
    if (!data) continue;
    snapshot.push([key, data]);
    const view = key[3] as InboxView;
    // The unread list keeps rows you just read until the next refetch, so
    // the row under your cursor doesn't vanish while you look at it.
    const keepRead = view === "unread" && patch.readAt !== undefined;
    qc.setQueryData<InfiniteData<InboxPage>>(key, {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        rows: p.rows
          .map((r) => (ids === "all" || ids.has(r.id) ? { ...r, ...patch } : r))
          .filter((r) => keepRead || belongs(view, r)),
      })),
    });
  }
  const counts = qc.getQueryData<InboxCounts>(inboxKeys.counts(ws));
  if (counts) {
    snapshot.push([inboxKeys.counts(ws), counts]);
    const rows = allRows(qc, ws);
    const affected = ids === "all" ? rows : rows.filter((r) => ids.has(r.id));
    // Count each row once, from its state before the patch.
    const seen = new Set<string>();
    let delta = 0;
    for (const r of affected) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const before = belongs("unread", r) ? 1 : 0;
      const after = belongs("unread", { ...r, ...patch }) ? 1 : 0;
      delta += after - before;
    }
    qc.setQueryData<InboxCounts>(inboxKeys.counts(ws), {
      ...counts,
      unread: ids === "all" && patch.readAt ? 0 : Math.max(0, counts.unread + delta),
    });
  }
  return snapshot;
}

function allRows(qc: QueryClient, ws: string): InboxRow[] {
  return qc
    .getQueriesData<InfiniteData<InboxPage>>({ queryKey: [...inboxKeys.all(ws), "list"] })
    .flatMap(([, d]) => d?.pages.flatMap((p) => p.rows) ?? []);
}

function restore(qc: QueryClient, snapshot: Snapshot) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const res = await p;
  if (!res.ok) throw new Error(res.message ?? res.error);
  return res.data;
}

export type InboxAction = "read" | "unread" | "archive" | "unarchive";

export function useInboxMutations(ws: string) {
  const qc = useQueryClient();
  const t = useTranslations("inbox");
  const settle = () => qc.invalidateQueries({ queryKey: inboxKeys.all(ws) });
  const fail = (_e: unknown, _v: unknown, ctx?: { snapshot: Snapshot }) => {
    if (ctx) restore(qc, ctx.snapshot);
    toast.error(t("errors.save"));
  };

  const update = useMutation({
    mutationFn: (v: { ids: string[]; action: InboxAction }) =>
      unwrap(updateNotificationsAction(ws, v)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all(ws) });
      const now = new Date().toISOString();
      const patch: Patch =
        v.action === "read"
          ? { readAt: now }
          : v.action === "unread"
            ? { readAt: null }
            : v.action === "archive"
              ? { archivedAt: now, snoozedUntil: null }
              : { archivedAt: null };
      return { snapshot: patchLists(qc, ws, new Set(v.ids), patch) };
    },
    onError: fail,
    onSettled: settle,
  });

  const snooze = useMutation({
    mutationFn: (v: { ids: string[]; until: string | null }) =>
      unwrap(snoozeNotificationsAction(ws, v)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all(ws) });
      const patch: Patch = v.until
        ? { snoozedUntil: v.until, readAt: null, archivedAt: null }
        : { snoozedUntil: null };
      return { snapshot: patchLists(qc, ws, new Set(v.ids), patch) };
    },
    onError: fail,
    onSettled: settle,
  });

  const markAll = useMutation({
    mutationFn: (v: { filter: InboxFilter | null }) => unwrap(markAllReadAction(ws, v)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all(ws) });
      const types: readonly string[] | null = v.filter ? INBOX_FILTERS[v.filter] : null;
      const ids = types
        ? new Set(
            allRows(qc, ws)
              .filter((r) => types.includes(r.type))
              .map((r) => r.id),
          )
        : "all";
      return { snapshot: patchLists(qc, ws, ids, { readAt: new Date().toISOString() }) };
    },
    onSuccess: (res) => toast(t("markedAllRead", { count: res.updated })),
    onError: fail,
    onSettled: settle,
  });

  return { update, snooze, markAll };
}
