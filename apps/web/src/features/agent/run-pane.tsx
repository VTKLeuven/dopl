"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentRun } from "./data";
import { RunCard } from "./run-card";

/** A run in a side pane (the Inbox reader): the approval card is in its steps. */
export function AgentRunPane({ ws, runId }: { ws: string; runId: string }) {
  const t = useTranslations("agent.run");
  const run = useAgentRun(ws, runId);
  return (
    <div className="h-full scrollbar-thin overflow-y-auto">
      <div className="mx-auto flex max-w-[720px] flex-col gap-3 px-4 py-6 md:px-6">
        {run.isPending ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : run.isError || !run.data ? (
          <p className="text-small text-fg-muted">{t("loadError")}</p>
        ) : (
          <ul className="flex flex-col">
            <RunCard ws={ws} run={run.data} variant="page" />
          </ul>
        )}
      </div>
    </div>
  );
}
