"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { decideApprovalAction, stopAgentRunAction } from "@/server/actions/agent";
import type { AgentActivity, AgentRunDetail, AgentRunSummary } from "@/server/queries/agent";
import { agentKeys } from "./keys";

export { agentKeys };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

const ACTIVE = new Set(["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"]);
export const isActiveRun = (status: string) => ACTIVE.has(status);

/** One run with its steps; realtime keeps it live (agentStep.* events). */
export function useAgentRun(ws: string, id: string, enabled = true) {
  return useQuery({
    queryKey: agentKeys.run(ws, id),
    queryFn: () => getJson<AgentRunDetail>(`/api/v1/${ws}/agent/runs/${id}`),
    enabled,
    staleTime: 5_000,
  });
}

export function useAgentActivity(ws: string, initial?: AgentActivity) {
  return useQuery({
    queryKey: agentKeys.activity(ws),
    queryFn: () => getJson<AgentActivity>(`/api/v1/${ws}/agent`),
    initialData: initial,
    staleTime: 10_000,
  });
}

/** Runs asked for in one conversation (DMs with Dopl, @mentions). */
export function useChannelRuns(ws: string, channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: agentKeys.channel(ws, channelId),
    queryFn: () => getJson<AgentRunSummary[]>(`/api/v1/${ws}/agent?channelId=${channelId}`),
    enabled,
    staleTime: 10_000,
  });
}

export function useDecideApproval(ws: string) {
  const qc = useQueryClient();
  const t = useTranslations("agent");
  return useMutation({
    mutationFn: async (input: { id: string; decision: "APPROVE" | "DENY"; note?: string }) => {
      const res = await decideApprovalAction(ws, input);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res.data;
    },
    onSuccess: (data) =>
      toast(data.status === "APPROVED" ? t("approval.approvedToast") : t("approval.deniedToast")),
    onError: (err) =>
      toast.error(
        /already_|expired/.test(err.message) ? t("approval.alreadyDecided") : t("errors.generic"),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: agentKeys.all(ws) }),
  });
}

export function useStopRun(ws: string) {
  const qc = useQueryClient();
  const t = useTranslations("agent");
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await stopAgentRunAction(ws, { id });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => toast(t("run.stoppedToast")),
    onError: () => toast.error(t("errors.generic")),
    onSettled: () => qc.invalidateQueries({ queryKey: agentKeys.all(ws) }),
  });
}
