"use client";

import { useTranslations } from "next-intl";
import { useHydrated } from "@/lib/use-hydrated";
import { useAgentActivity } from "./data";

/**
 * The sidebar's Dopl item: how many approvals wait (for approvers), or
 * "Paused" when the kill switch is on (DESIGN_SYSTEM §4.1).
 */
export function AgentNavBadge({ ws }: { ws: string }) {
  return useHydrated() ? <Badge ws={ws} /> : null;
}

function Badge({ ws }: { ws: string }) {
  const t = useTranslations("agent");
  const data = useAgentActivity(ws).data;
  if (!data) return null;
  if (data.paused)
    return <span className="text-micro font-medium text-fg-muted">{t("pausedBadge")}</span>;
  const count = data.canApprove ? data.pending.length : 0;
  if (count === 0) return null;
  return (
    <span
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-bg px-1 text-micro font-semibold text-warning-text tabular"
      aria-label={t("pendingBadge", { count })}
      data-testid="agent-badge"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
