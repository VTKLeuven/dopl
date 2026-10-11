"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DEFAULT_HOME_LAYOUT } from "@dopl/shared/domain/home";
import type { HomeLayout } from "@dopl/shared/schemas/home";
import type { ActionResult } from "@/server/action-result";
import { saveHomeLayoutAction } from "@/server/actions/home";
import type { HomeLayoutState, ViewPreview } from "@/server/queries/home";
import type { PaletteData } from "@/server/queries/palette";

/** Realtime: `home.layout` refetches the layout; item and view events the view previews. */
export const homeKeys = {
  layout: (ws: string) => ["home", ws, "layout"] as const,
  views: (ws: string) => ["home", ws, "view"] as const,
  view: (ws: string, id: string) => ["home", ws, "view", id] as const,
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

export const isNotFound = (err: unknown) =>
  err instanceof HttpError && (err.status === 404 || err.status === 403);

function unwrap<T>(res: ActionResult<T>): T {
  if (!res.ok) throw Object.assign(new Error(res.message ?? res.error), { code: res.error });
  return res.data;
}

export function useHomeLayout(ws: string, initial: HomeLayoutState) {
  return useQuery({
    queryKey: homeKeys.layout(ws),
    queryFn: () => getJson<HomeLayoutState>(`/api/v1/${ws}/home/layout`),
    initialData: initial,
  });
}

/**
 * Every edit saves the whole layout at once, applied optimistically. Saves
 * queue in order, and only the last one to settle refetches, so a quick
 * second drag never flickers back to the first one's result.
 */
export function useSaveHomeLayout(ws: string) {
  const qc = useQueryClient();
  const t = useTranslations("home.edit");
  const key = homeKeys.layout(ws);
  const mutationKey = ["home", ws, "save"];
  return useMutation({
    mutationKey,
    mutationFn: async (layout: HomeLayout | null) =>
      unwrap(await saveHomeLayoutAction(ws, { layout })),
    onMutate: async (layout) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<HomeLayoutState>(key);
      qc.setQueryData<HomeLayoutState>(
        key,
        layout ? { layout, custom: true } : { layout: DEFAULT_HOME_LAYOUT, custom: false },
      );
      return { previous };
    },
    onError: (_err, _layout, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
      toast.error(t("saveFailed"));
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) <= 1) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useViewPreview(ws: string, id: string) {
  return useQuery({
    queryKey: homeKeys.view(ws, id),
    queryFn: () => getJson<ViewPreview>(`/api/v1/${ws}/views/${id}/preview`),
    staleTime: 30_000,
    retry: (count, err) => !isNotFound(err) && count < 1,
  });
}

/** The views ⌘K lists (yours and shared ones), for the view widget's picker. */
export function useViewOptions(ws: string, enabled: boolean) {
  return useQuery({
    queryKey: ["palette", ws],
    queryFn: () => getJson<PaletteData>(`/api/v1/${ws}/palette`),
    enabled,
    staleTime: 60_000,
    select: (d) => d.views,
  });
}
