"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { UpdateWorkItemInput } from "@dopl/shared/schemas/work-item";
import { isEmptyFilter, normalizeFilter, type FilterGroup } from "@dopl/shared/schemas/filters";
import {
  createWorkItemAction,
  createWorkItemsAction,
  moveWorkItemAction,
  setDeletedAction,
  updateWorkItemAction,
  bulkUpdateWorkItemsAction,
} from "@/server/actions/work-items";
import type { ActionResult } from "@/server/action-result";
import type { ProjectMeta, WorkItemDetail, WorkItemRow } from "./types";

export type CompletedMode = "hide" | "recent" | "show";
export interface ItemsData {
  rows: WorkItemRow[];
  hiddenDone: number;
  hiddenByState: Record<string, number>;
}

/* ─────────────── query keys (one place; realtime reuses them later) ─────────────── */
export const keys = {
  items: (projectId: string) => ["items", projectId] as const,
  itemsQuery: (projectId: string, mode: CompletedMode, filterKey: string) =>
    ["items", projectId, mode, filterKey] as const,
  meta: (projectId: string) => ["meta", projectId] as const,
  relations: (projectId: string) => ["relations", projectId] as const,
  detail: (ref: string) => ["item", ref.toUpperCase()] as const,
  search: (q: string, projectId?: string) => ["search-items", q, projectId ?? null] as const,
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

/** Stable string for a filter; empty filters share one cache entry. */
export function filterKey(filters: FilterGroup): string {
  return isEmptyFilter(filters) ? "" : JSON.stringify(normalizeFilter(filters));
}

export function itemsSearchParams(mode: CompletedMode, filters: FilterGroup): string {
  const key = filterKey(filters);
  return `completed=${mode}${key ? `&f=${encodeURIComponent(key)}` : ""}`;
}

/** Where a list of items comes from: one project, or every project (workspace views). */
export type ItemsScope = { kind: "project"; projectId: string } | { kind: "workspace" };

/** Cache key for a scope; project scopes use the project id so mutations can find them. */
export function scopeKey(scope: ItemsScope): string {
  return scope.kind === "project" ? scope.projectId : "workspace";
}

function scopeBase(ws: string, scope: ItemsScope): string {
  return scope.kind === "project" ? `/api/v1/${ws}/projects/${scope.projectId}` : `/api/v1/${ws}`;
}

export function useItems(
  ws: string,
  scope: ItemsScope,
  query: { completed: CompletedMode; filters: FilterGroup },
  initial?: ItemsData,
) {
  return useQuery({
    queryKey: keys.itemsQuery(scopeKey(scope), query.completed, filterKey(query.filters)),
    queryFn: () =>
      getJson<ItemsData>(
        `${scopeBase(ws, scope)}/items?${itemsSearchParams(query.completed, query.filters)}`,
      ),
    initialData: initial,
    placeholderData: (prev) => prev,
  });
}

export function useScopeMeta(ws: string, scope: ItemsScope, initial?: ProjectMeta) {
  return useQuery({
    queryKey: keys.meta(scopeKey(scope)),
    queryFn: () => getJson<ProjectMeta>(`${scopeBase(ws, scope)}/meta`),
    initialData: initial,
    staleTime: 5 * 60_000,
  });
}

export function useProjectMeta(ws: string, projectId: string, initial?: ProjectMeta) {
  return useQuery({
    queryKey: keys.meta(projectId),
    queryFn: () => getJson<ProjectMeta>(`/api/v1/${ws}/projects/${projectId}/meta`),
    enabled: Boolean(projectId),
    initialData: initial,
    staleTime: 5 * 60_000,
  });
}

export interface BlockingRelation {
  id: string;
  sourceId: string;
  targetId: string;
}
export function useBlockingRelations(ws: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: keys.relations(projectId),
    queryFn: () => getJson<BlockingRelation[]>(`/api/v1/${ws}/projects/${projectId}/relations`),
    enabled,
    staleTime: 30_000,
  });
}

export function useWorkItemDetail(ws: string, ref: string | null, initial?: WorkItemDetail) {
  return useQuery({
    queryKey: keys.detail(ref ?? ""),
    queryFn: () => getJson<WorkItemDetail>(`/api/v1/${ws}/items/${encodeURIComponent(ref ?? "")}`),
    enabled: Boolean(ref),
    initialData: initial,
  });
}

export interface SearchHit {
  id: string;
  identifier: string;
  title: string;
  stateGroup: WorkItemRow["stateGroup"];
}
export function useItemSearch(ws: string, q: string, projectId?: string, enabled = true) {
  return useQuery({
    queryKey: keys.search(q, projectId),
    queryFn: () =>
      getJson<SearchHit[]>(
        `/api/v1/${ws}/search/items?q=${encodeURIComponent(q)}${projectId ? `&projectId=${projectId}` : ""}`,
      ),
    enabled,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}

/* ─────────────── optimistic helpers ─────────────── */

function patchRow(
  row: WorkItemRow,
  patch: Omit<UpdateWorkItemInput, "id">,
  meta?: ProjectMeta,
): WorkItemRow {
  const next = { ...row, updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.typeId !== undefined) next.typeId = patch.typeId;
  if (patch.parentId !== undefined) next.parentId = patch.parentId;
  if (patch.startDate !== undefined) next.startDate = patch.startDate;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.estimate !== undefined) next.estimate = patch.estimate;
  if (patch.assigneeIds !== undefined) next.assigneeIds = patch.assigneeIds;
  if (patch.labelIds !== undefined) next.labelIds = patch.labelIds;
  if (patch.stateId !== undefined) {
    next.stateId = patch.stateId;
    const s = meta?.states.find((x) => x.id === patch.stateId);
    if (s) {
      next.stateGroup = s.group;
      next.completedAt =
        s.group === "COMPLETED" ? (row.completedAt ?? new Date().toISOString()) : null;
    }
  }
  return next;
}

type Snapshot = Array<[readonly unknown[], unknown]>;

function patchCaches(
  qc: QueryClient,
  projectId: string,
  ids: string[],
  patch: Omit<UpdateWorkItemInput, "id">,
): Snapshot {
  const meta = qc.getQueryData<ProjectMeta>(keys.meta(projectId));
  const snapshot: Snapshot = [];
  for (const [key, data] of qc.getQueriesData<ItemsData>({ queryKey: keys.items(projectId) })) {
    snapshot.push([key, data]);
    if (data)
      qc.setQueryData<ItemsData>(key, {
        ...data,
        rows: data.rows.map((r) => (ids.includes(r.id) ? patchRow(r, patch, meta) : r)),
      });
  }
  for (const [key, data] of qc.getQueriesData<WorkItemDetail>({ queryKey: ["item"] })) {
    if (!data) continue;
    const touchesSelf = ids.includes(data.id);
    const touchesChild = data.children.some((c) => ids.includes(c.id));
    if (!touchesSelf && !touchesChild) continue;
    snapshot.push([key, data]);
    qc.setQueryData<WorkItemDetail>(key, {
      ...(touchesSelf ? { ...data, ...patchRow(data, patch, meta) } : data),
      children: data.children.map((c) => (ids.includes(c.id) ? patchRow(c, patch, meta) : c)),
    });
  }
  return snapshot;
}

function restore(qc: QueryClient, snapshot: Snapshot) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

function unwrap<T>(res: ActionResult<T>): T {
  if (!res.ok) throw Object.assign(new Error(res.message ?? res.error), { code: res.error });
  return res.data;
}

/* ─────────────── mutations ─────────────── */

export function useUpdateItem(ws: string, projectId: string) {
  const qc = useQueryClient();
  const t = useTranslations("items");
  return useMutation({
    mutationFn: async (input: UpdateWorkItemInput) => unwrap(await updateWorkItemAction(ws, input)),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.items(projectId) });
      const { id, ...patch } = input;
      return { snapshot: patchCaches(qc, projectId, [id], patch) };
    },
    onError: (err, _input, context) => {
      if (context) restore(qc, context.snapshot);
      toast.error(errorMessage(t, err));
    },
    onSettled: (_data, _err, input) => {
      void qc.invalidateQueries({ queryKey: keys.items(projectId), refetchType: "none" });
      for (const [key, data] of qc.getQueriesData<WorkItemDetail>({ queryKey: ["item"] })) {
        if (data && (data.id === input.id || data.children.some((c) => c.id === input.id)))
          void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useBulkUpdate(ws: string, projectId: string) {
  const qc = useQueryClient();
  const t = useTranslations("items");
  return useMutation({
    mutationFn: async (input: {
      ids: string[];
      patch: Omit<UpdateWorkItemInput, "id" | "title" | "description">;
    }) => unwrap(await bulkUpdateWorkItemsAction(ws, input)),
    onMutate: async ({ ids, patch }) => {
      await qc.cancelQueries({ queryKey: keys.items(projectId) });
      return { snapshot: patchCaches(qc, projectId, ids, patch) };
    },
    onError: (err, _input, context) => {
      if (context) restore(qc, context.snapshot);
      toast.error(errorMessage(t, err));
    },
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: keys.items(projectId), refetchType: "none" }),
  });
}

export function useMoveItem(ws: string, projectId: string) {
  const qc = useQueryClient();
  const t = useTranslations("items");
  return useMutation({
    mutationFn: async (input: {
      id: string;
      beforeId: string | null;
      afterId: string | null;
      optimisticKey: string;
    }) =>
      unwrap(
        await moveWorkItemAction(ws, {
          id: input.id,
          beforeId: input.beforeId,
          afterId: input.afterId,
        }),
      ),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.items(projectId) });
      const snapshot: Snapshot = [];
      for (const [key, data] of qc.getQueriesData<ItemsData>({ queryKey: keys.items(projectId) })) {
        snapshot.push([key, data]);
        if (data) {
          const rows = data.rows.map((r) =>
            r.id === input.id ? { ...r, sortKey: input.optimisticKey } : r,
          );
          rows.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
          qc.setQueryData<ItemsData>(key, { ...data, rows });
        }
      }
      return { snapshot };
    },
    onError: (err, _input, context) => {
      if (context) restore(qc, context.snapshot);
      toast.error(errorMessage(t, err));
    },
    onSuccess: (data) => {
      // Adopt the server's key (it may differ if neighbours changed meanwhile).
      for (const [key, cached] of qc.getQueriesData<ItemsData>({
        queryKey: keys.items(projectId),
      })) {
        if (!cached) continue;
        const rows = cached.rows.map((r) =>
          r.id === data.id ? { ...r, sortKey: data.sortKey } : r,
        );
        rows.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
        qc.setQueryData<ItemsData>(key, { ...cached, rows });
      }
    },
  });
}

export function useCreateItems(ws: string, projectId: string) {
  const qc = useQueryClient();
  const t = useTranslations("items");
  return useMutation({
    mutationFn: async (input: { titles: string[]; shared: Record<string, unknown> }) => {
      if (input.titles.length === 1) {
        const created = unwrap(
          await createWorkItemAction(ws, { projectId, title: input.titles[0], ...input.shared }),
        );
        return [created];
      }
      return unwrap(
        await createWorkItemsAction(ws, { projectId, titles: input.titles, ...input.shared }),
      );
    },
    onError: (err) => toast.error(errorMessage(t, err)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.items(projectId) }),
  });
}

/** Delete with an undo toast (D-020). */
export function useDeleteItems(ws: string, projectId: string) {
  const qc = useQueryClient();
  const t = useTranslations("items");
  const restoreItems = async (ids: string[]) => {
    unwrap(await setDeletedAction(ws, ids, false));
    await qc.invalidateQueries({ queryKey: keys.items(projectId) });
  };
  return useMutation({
    mutationFn: async (ids: string[]) => unwrap(await setDeletedAction(ws, ids, true)),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: keys.items(projectId) });
      const snapshot: Snapshot = [];
      for (const [key, data] of qc.getQueriesData<ItemsData>({ queryKey: keys.items(projectId) })) {
        snapshot.push([key, data]);
        if (data)
          qc.setQueryData<ItemsData>(key, {
            ...data,
            rows: data.rows.filter((r) => !ids.includes(r.id)),
          });
      }
      return { snapshot };
    },
    onError: (err, _ids, context) => {
      if (context) restore(qc, context.snapshot);
      toast.error(errorMessage(t, err));
    },
    onSuccess: (_data, ids) => {
      toast(t("deleted", { count: ids.length }), {
        duration: 6000,
        action: { label: t("undo"), onClick: () => void restoreItems(ids) },
      });
    },
  });
}

function errorMessage(t: ReturnType<typeof useTranslations<"items">>, err: unknown): string {
  const code = (err as { code?: string; message?: string })?.message;
  switch (code) {
    case "start_after_due":
      return t("errors.startAfterDue");
    case "parent_cycle":
      return t("errors.parentCycle");
    case "forbidden":
      return t("errors.forbidden");
    default:
      return t("errors.generic");
  }
}
