"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { keyBetween } from "@dopl/shared/sort-keys";
import type { MetricQuery, WidgetSpec, WidgetWidth } from "@dopl/shared/schemas/analytics";
import type { ActionResult } from "@/server/action-result";
import {
  createDashboardAction,
  deleteDashboardAction,
  deleteWidgetAction,
  moveWidgetAction,
  resizeWidgetAction,
  saveWidgetAction,
  updateDashboardAction,
} from "@/server/actions/dashboards";
import type { DashboardDetail, DashboardSummary, MetricResult } from "./types";

export const analyticsKeys = {
  all: (ws: string) => ["analytics", ws] as const,
  metric: (ws: string, q: MetricQuery) => ["analytics", ws, "metric", JSON.stringify(q)] as const,
  dashboards: (ws: string) => ["analytics", ws, "dashboards"] as const,
  dashboard: (ws: string, id: string) => ["analytics", ws, "dashboard", id] as const,
};

class HttpError extends Error {
  constructor(readonly status: number) {
    super(String(status));
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new HttpError(res.status);
  return (await res.json()) as T;
}

function unwrap<T>(res: ActionResult<T>): T {
  if (!res.ok) throw Object.assign(new Error(res.message ?? res.error), { code: res.error });
  return res.data;
}

/**
 * One chart's data. Charts are recomputed on read, so they don't listen to
 * realtime events (a burst of edits would refetch every chart); they refresh
 * after a minute or on focus. A new range keeps the old chart until the new
 * one arrives (no skeleton flash).
 */
export function useMetric(ws: string, query: MetricQuery, enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.metric(ws, query),
    queryFn: () =>
      getJson<MetricResult>(
        `/api/v1/${ws}/analytics/query?q=${encodeURIComponent(JSON.stringify(query))}`,
      ),
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    retry: (count, err) => !(err instanceof HttpError && err.status < 500) && count < 1,
  });
}

export function useDashboards(ws: string, initial?: DashboardSummary[]) {
  return useQuery({
    queryKey: analyticsKeys.dashboards(ws),
    queryFn: () => getJson<DashboardSummary[]>(`/api/v1/${ws}/dashboards`),
    initialData: initial,
  });
}

export function useDashboard(ws: string, id: string, initial?: DashboardDetail) {
  return useQuery({
    queryKey: analyticsKeys.dashboard(ws, id),
    queryFn: () => getJson<DashboardDetail>(`/api/v1/${ws}/dashboards/${id}`),
    initialData: initial,
  });
}

function useErrorToast() {
  const t = useTranslations("analytics.errors");
  return (err: unknown) => {
    const code = (err as { code?: string })?.code;
    toast.error(code === "forbidden" ? t("forbidden") : t("generic"));
  };
}

export function useDashboardMutations(ws: string) {
  const qc = useQueryClient();
  const onError = useErrorToast();
  const refreshList = () => void qc.invalidateQueries({ queryKey: analyticsKeys.dashboards(ws) });
  return {
    create: useMutation({
      mutationFn: async (input: {
        name: string;
        projectId?: string | null;
        fromDefault?: "workspace" | "project" | null;
        titles?: Record<string, string>;
      }) => unwrap(await createDashboardAction(ws, input)),
      onSuccess: refreshList,
      onError,
    }),
    update: useMutation({
      mutationFn: async (input: {
        id: string;
        name?: string;
        visibility?: "PRIVATE" | "WORKSPACE";
      }) => unwrap(await updateDashboardAction(ws, input)),
      onSuccess: (_r, input) => {
        refreshList();
        void qc.invalidateQueries({ queryKey: analyticsKeys.dashboard(ws, input.id) });
      },
      onError,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await deleteDashboardAction(ws, id)),
      onSuccess: refreshList,
      onError,
    }),
  };
}

/** Widget edits on one dashboard; layout changes are optimistic with rollback. */
export function useWidgetMutations(ws: string, dashboardId: string) {
  const qc = useQueryClient();
  const onError = useErrorToast();
  const key = analyticsKeys.dashboard(ws, dashboardId);
  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  const optimistic = async (patch: (d: DashboardDetail) => DashboardDetail) => {
    await qc.cancelQueries({ queryKey: key });
    const before = qc.getQueryData<DashboardDetail>(key);
    if (before) qc.setQueryData(key, patch(before));
    return { before };
  };
  const rollback = (err: unknown, _v: unknown, ctx?: { before?: DashboardDetail }) => {
    if (ctx?.before) qc.setQueryData(key, ctx.before);
    onError(err);
  };

  return {
    save: useMutation({
      mutationFn: async (input: {
        id?: string;
        title: string;
        spec: WidgetSpec;
        w?: WidgetWidth;
      }) => unwrap(await saveWidgetAction(ws, { dashboardId, ...input })),
      onSuccess: refresh,
      onError,
    }),
    move: useMutation({
      mutationFn: async (input: { id: string; before: string | null; after: string | null }) =>
        unwrap(await moveWidgetAction(ws, input)),
      onMutate: (input) =>
        optimistic((d) => {
          const moved = keyBetween(input.before, input.after);
          const widgets = d.widgets
            .map((w) => (w.id === input.id ? { ...w, key: moved } : w))
            .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
          return { ...d, widgets };
        }),
      onError: rollback,
      onSettled: refresh,
    }),
    resize: useMutation({
      mutationFn: async (input: { id: string; w: WidgetWidth }) =>
        unwrap(await resizeWidgetAction(ws, input)),
      onMutate: (input) =>
        optimistic((d) => ({
          ...d,
          widgets: d.widgets.map((w) => (w.id === input.id ? { ...w, w: input.w } : w)),
        })),
      onError: rollback,
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await deleteWidgetAction(ws, id)),
      onMutate: (id) =>
        optimistic((d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== id) })),
      onError: rollback,
      onSettled: refresh,
    }),
  };
}
