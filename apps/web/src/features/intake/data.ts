"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { IntakeTab } from "@dopl/shared/schemas/intake";
import type { IntakeCounts, IntakeRow } from "@/server/queries/intake";
import type { ActionResult } from "@/server/action-result";
import { keys as itemKeys } from "@/features/work-items/data";

export interface IntakeData {
  rows: IntakeRow[];
  counts: IntakeCounts;
}

export const intakeKeys = {
  all: (projectId: string) => ["intake", projectId] as const,
  tab: (projectId: string, tab: IntakeTab) => ["intake", projectId, tab] as const,
};

export function useIntake(ws: string, projectId: string, tab: IntakeTab, initial?: IntakeData) {
  return useQuery({
    queryKey: intakeKeys.tab(projectId, tab),
    queryFn: async () => {
      const res = await fetch(`/api/v1/${ws}/projects/${projectId}/intake?tab=${tab}`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as IntakeData;
    },
    initialData: initial,
    placeholderData: (prev) => prev,
  });
}

const MOVES_TO: Record<string, IntakeTab | null> = {
  accept: "accepted",
  decline: "declined",
  duplicate: "duplicate",
  snooze: "snoozed",
  unsnooze: "pending",
  reopen: "pending",
};

/**
 * A triage decision: the row leaves the current tab at once (optimistic),
 * counts shift, and the realtime event refreshes everyone else's queue.
 */
export function useTriage(ws: string, projectId: string, tab: IntakeTab) {
  const qc = useQueryClient();
  const t = useTranslations("intake");
  return useMutation({
    mutationFn: async ({
      run,
    }: {
      id: string;
      kind: keyof typeof MOVES_TO;
      run: () => Promise<ActionResult<unknown>>;
    }) => {
      const res = await run();
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res.data;
    },
    onMutate: async ({ id, kind }) => {
      const key = intakeKeys.tab(projectId, tab);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<IntakeData>(key);
      if (prev) {
        const to = MOVES_TO[kind];
        const counts = { ...prev.counts };
        counts[tab] = Math.max(0, counts[tab] - 1);
        if (to) counts[to] += 1;
        qc.setQueryData<IntakeData>(key, {
          rows: prev.rows.filter((r) => r.id !== id),
          counts,
        });
      }
      return { prev };
    },
    onError: (err, _v, context) => {
      if (context?.prev) qc.setQueryData(intakeKeys.tab(projectId, tab), context.prev);
      toast.error(
        err.message === "already_triaged" ? t("errors.alreadyTriaged") : t("errors.generic"),
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: intakeKeys.all(projectId) });
      void qc.invalidateQueries({ queryKey: itemKeys.items(projectId) });
      void ws;
    },
  });
}
