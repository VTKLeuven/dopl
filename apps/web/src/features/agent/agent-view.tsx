"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bot, CircleCheck, MessagesSquare, PauseCircle, SquareKanban } from "lucide-react";
import type { AgentActivity, PendingApproval } from "@/server/queries/agent";
import { setAgentPausedAction } from "@/server/actions/agent";
import { useRelativeTime } from "@/lib/use-relative-time";
import { AgentAvatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shell/page-header";
import { PageHeaderSkeleton } from "@/components/shell/page-skeletons";
import { ApprovalCard } from "./approval-card";
import { isActiveRun, useAgentActivity } from "./data";
import { RunCard } from "./run-card";

export function AgentSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <PageHeaderSkeleton />
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-3 px-4 py-6 md:px-10">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

function Where({ ws, a }: { ws: string; a: PendingApproval }) {
  const t = useTranslations("agent");
  const relative = useRelativeTime();
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-small text-fg-muted">
      {a.run.workItem ? (
        <Link
          href={`/${ws}/i/${a.run.workItem.identifier}` as never}
          className="inline-flex min-w-0 items-center gap-1 text-fg-secondary hover:text-fg"
        >
          <SquareKanban className="size-3.5 shrink-0" aria-hidden />
          <span className="tabular">{a.run.workItem.identifier}</span>
          <span className="max-w-64 truncate">{a.run.workItem.title}</span>
        </Link>
      ) : a.run.channel ? (
        <Link
          href={`/${ws}/messages/c/${a.run.channel.id}` as never}
          className="inline-flex items-center gap-1 text-fg-secondary hover:text-fg"
        >
          <MessagesSquare className="size-3.5" aria-hidden />
          {a.run.channel.name ?? t("run.directMessage")}
        </Link>
      ) : null}
      <span>·</span>
      <span>{t("askedBy", { name: a.run.triggeredBy?.name ?? t("run.someone") })}</span>
      <span>·</span>
      <span suppressHydrationWarning>{relative(a.requestedAt)}</span>
      <Link href={`/${ws}/agent/runs/${a.run.id}` as never} className="text-link hover:underline">
        {t("viewRun")}
      </Link>
    </p>
  );
}

/**
 * The agent page (Phase 8): what's waiting for a human first, then what
 * Dopl has been doing. Mobile-friendly: approvals stack full width.
 */
export function AgentView({ ws, initial }: { ws: string; initial: AgentActivity }) {
  const t = useTranslations("agent");
  const router = useRouter();
  const data = useAgentActivity(ws, initial).data ?? initial;
  const [pausing, setPausing] = useState(false);
  const working = data.runs.some((r) => isActiveRun(r.status));

  const togglePause = async (paused: boolean) => {
    setPausing(true);
    const res = await setAgentPausedAction(ws, { paused });
    setPausing(false);
    if (!res.ok) return toast.error(t("errors.generic"));
    toast(
      paused ? t("pause.pausedToast", { count: res.data.stoppedRuns }) : t("pause.resumedToast"),
    );
    router.refresh();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        crumbs={[{ label: t("title"), icon: <Bot /> }]}
        actions={
          data.canPause ? (
            <label className="flex items-center gap-2 text-small text-fg-secondary">
              <PauseCircle className="size-4 text-icon" aria-hidden />
              {t("pause.label")}
              <Switch
                checked={Boolean(data.paused)}
                disabled={pausing}
                onCheckedChange={(v) => void togglePause(v)}
                data-testid="agent-pause"
              />
            </label>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-10">
          <div className="flex items-center gap-3">
            <AgentAvatar size="lg" working={working && !data.paused} />
            <div className="flex flex-col">
              <h1 className="text-title font-semibold text-fg">{t("heading")}</h1>
              <p className="text-small text-fg-muted">
                {data.paused
                  ? t("statusPaused")
                  : working
                    ? t("statusWorking")
                    : t("statusIdle")}
              </p>
            </div>
          </div>

          {data.paused ? (
            <div data-testid="agent-paused-banner">
              <Banner tone="warning" title={t("pause.bannerTitle")}>
                {t("pause.bannerBody", { name: data.paused.by ?? "?" })}
              </Banner>
            </div>
          ) : null}

          <section className="flex flex-col gap-3" data-testid="pending-approvals">
            <h2 className="text-body font-semibold text-fg">
              {t("pendingTitle")}
              {data.pending.length ? (
                <span className="ml-1.5 text-fg-muted tabular">{data.pending.length}</span>
              ) : null}
            </h2>
            {data.pending.length === 0 ? (
              <EmptyState
                compact
                icon={<CircleCheck />}
                title={t("pendingEmptyTitle")}
                description={t("pendingEmptyBody")}
              />
            ) : (
              data.pending.map((a) => (
                <div key={a.id} className="flex flex-col gap-1.5">
                  <Where ws={ws} a={a} />
                  <ApprovalCard
                    ws={ws}
                    approval={a}
                    canApprove={data.canApprove}
                    untrusted={a.run.untrusted}
                  />
                </div>
              ))
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-body font-semibold text-fg">{t("recentTitle")}</h2>
            {data.runs.length === 0 ? (
              <EmptyState
                compact
                icon={<Bot />}
                title={t("runsEmptyTitle")}
                description={t("runsEmptyBody")}
              />
            ) : (
              <ul className="flex flex-col gap-2" data-testid="agent-runs">
                {data.runs.map((r) => (
                  <RunCard key={r.id} ws={ws} run={r} variant="compact" />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
