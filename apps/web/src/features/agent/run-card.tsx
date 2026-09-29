"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  CircleStop,
  ExternalLink,
  FileText,
  ShieldAlert,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import type { AgentRunSummary, AgentStepView } from "@/server/queries/agent";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { AgentAvatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApprovalCard, EnvBadge } from "./approval-card";
import { isActiveRun, useAgentRun, useStopRun } from "./data";

const STATUS_CLASS: Record<string, string> = {
  QUEUED: "border-border bg-surface-muted text-fg-secondary",
  RUNNING: "border-sky-200 bg-sky-50 text-sky-800",
  WAITING_FOR_APPROVAL: "border-warning-border bg-warning-bg text-warning-text",
  COMPLETED: "border-success-border bg-success-bg text-success-text",
  FAILED: "border-danger-border bg-danger-bg text-danger-text",
  CANCELLED: "border-border bg-surface-muted text-fg-muted",
  INTERRUPTED: "border-border bg-surface-muted text-fg-muted",
};

export function RunStatusPill({ status }: { status: string }) {
  const t = useTranslations("agent.status");
  return (
    <span
      data-testid="run-status"
      data-status={status}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-[6px] border px-1.5 text-caption font-medium",
        STATUS_CLASS[status],
      )}
    >
      {status === "RUNNING" ? <Spinner size={10} /> : null}
      {t(status as "RUNNING")}
    </span>
  );
}

/** Friendly one-liners for Dopl's own MCP tools. */
function toolLabel(
  t: ReturnType<typeof useTranslations<"agent.tool">>,
  step: AgentStepView,
): string {
  const input = (step.input ?? {}) as Record<string, unknown>;
  const ident = typeof input.identifier === "string" ? input.identifier : "";
  switch (step.toolName) {
    case "search_work_items":
      return t("search", { query: typeof input.query === "string" ? input.query : "" });
    case "get_work_item":
      return t("read", { identifier: ident });
    case "create_work_item":
      return t("create", { title: typeof input.title === "string" ? input.title : "" });
    case "update_work_item":
      return t("update", { identifier: ident });
    case "add_comment":
      return t("comment", { identifier: ident });
    case "list_assigned_threads":
      return t("threads");
    case "get_email_thread":
      return t("email");
    case "list_hosts":
      return t("hosts");
    default:
      return t("other", { tool: step.toolName ?? step.title ?? "tool" });
  }
}

function Output({ text, truncated }: { text: string; truncated?: boolean }) {
  const t = useTranslations("agent.run");
  return (
    <pre
      data-testid="step-output"
      className="max-h-72 overflow-auto rounded-control bg-neutral-900 px-3 py-2 font-mono text-caption leading-relaxed whitespace-pre-wrap text-neutral-100"
    >
      {text}
      {truncated ? `\n${t("truncated")}` : null}
    </pre>
  );
}

function Step({
  ws,
  step,
  canApprove,
  untrusted,
}: {
  ws: string;
  step: AgentStepView;
  canApprove: boolean;
  untrusted: boolean;
}) {
  const t = useTranslations("agent.run");
  const tt = useTranslations("agent.tool");
  const [open, setOpen] = useState(false);
  switch (step.kind) {
    case "ASSISTANT_MESSAGE":
      return step.output ? (
        <p className="text-body whitespace-pre-wrap text-fg-secondary" data-testid="step-message">
          {step.output}
        </p>
      ) : null;
    case "STATUS":
      return step.title === "untrusted" ? (
        <p
          className="flex items-start gap-1.5 text-small text-warning-text"
          data-testid="step-tainted"
        >
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("taintedStep")}
        </p>
      ) : (
        <p className="text-small text-fg-muted">{step.output}</p>
      );
    case "ERROR":
      return <p className="text-small text-danger-text">{step.output}</p>;
    case "COMMAND": {
      const waiting = step.approval?.status === "PENDING";
      return (
        <div className="flex flex-col gap-1.5" data-testid="step-command" data-status={step.status}>
          <div className="flex flex-wrap items-center gap-1.5 text-small">
            <SquareTerminal className="size-3.5 text-icon" aria-hidden />
            <span className="font-medium text-fg">{step.host?.name ?? step.title}</span>
            {step.host ? <EnvBadge environment={step.host.environment} /> : null}
            <span className="min-w-0 flex-1 truncate font-mono text-caption text-fg-secondary">
              $ {step.command}
            </span>
            {step.status === "RUNNING" && !waiting ? <Spinner size={12} /> : null}
            {step.exitCode !== null ? (
              <span
                className={cn(
                  "font-mono text-caption",
                  step.exitCode === 0 ? "text-fg-muted" : "text-danger-text",
                )}
              >
                {t("exit", { code: step.exitCode })}
              </span>
            ) : step.status === "DENIED" ? (
              <span className="text-caption font-medium text-danger-text">{t("denied")}</span>
            ) : step.status === "CANCELLED" ? (
              <span className="text-caption text-fg-muted">{t("cancelledStep")}</span>
            ) : null}
          </div>
          {step.approval ? (
            <ApprovalCard
              ws={ws}
              approval={step.approval}
              canApprove={canApprove}
              untrusted={untrusted}
            />
          ) : null}
          {step.output && !(step.approval && step.status === "DENIED") ? (
            <Output text={step.output} truncated={step.outputTruncated} />
          ) : null}
        </div>
      );
    }
    case "TOOL_CALL":
    default: {
      const hasOutput = Boolean(step.output);
      return (
        <div
          className="flex flex-col gap-1.5"
          data-testid="step-tool"
          data-tool={step.toolName ?? ""}
        >
          <button
            type="button"
            disabled={!hasOutput}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-1.5 self-start rounded-[6px] text-left text-small text-fg-secondary focus-ring enabled:hover:text-fg"
          >
            <Wrench className="size-3.5 text-icon" aria-hidden />
            <span>{toolLabel(tt, step)}</span>
            {step.status === "RUNNING" && !step.approval ? <Spinner size={12} /> : null}
            {step.status === "FAILED" ? (
              <span className="text-caption text-danger-text">{t("failed")}</span>
            ) : null}
            {step.status === "DENIED" ? (
              <span className="text-caption text-danger-text">{t("denied")}</span>
            ) : null}
            {hasOutput ? (
              <ChevronDown
                className={cn("size-3.5 transition-transform", open && "rotate-180")}
                aria-hidden
              />
            ) : null}
          </button>
          {step.approval ? (
            <ApprovalCard
              ws={ws}
              approval={step.approval}
              canApprove={canApprove}
              untrusted={untrusted}
            />
          ) : null}
          {open && step.output ? (
            <Output text={step.output} truncated={step.outputTruncated} />
          ) : null}
        </div>
      );
    }
  }
}

/**
 * One agent run on a timeline (item, DM, the agent page): the gradient
 * avatar, status, live steps and approvals, and Stop (DESIGN_SYSTEM §6).
 * Active runs and runs waiting for approval open by default.
 */
export function RunCard({
  ws,
  run,
  variant = "timeline",
}: {
  ws: string;
  run: AgentRunSummary;
  variant?: "timeline" | "page" | "compact";
}) {
  const t = useTranslations("agent.run");
  const tTrigger = useTranslations("agent.trigger");
  const relative = useRelativeTime();
  const active = isActiveRun(run.status);
  const [open, setOpen] = useState(variant === "page" || active || run.pendingApprovals > 0);
  const detail = useAgentRun(ws, run.id, open);
  const stop = useStopRun(ws);
  const d = detail.data;
  const status = d?.status ?? run.status;
  const live = isActiveRun(status);
  const steps = (d?.steps ?? []).filter(
    // The final answer is posted as the agent's comment or message.
    (s, i, all) =>
      !(
        status === "COMPLETED" &&
        s.kind === "ASSISTANT_MESSAGE" &&
        i === all.length - 1 &&
        s.output?.trim() === (d?.result ?? "").trim()
      ),
  );
  const who = run.triggeredBy?.name;

  return (
    <li
      className={cn("relative flex gap-2", variant === "compact" && "list-none")}
      data-testid="agent-run"
      data-run-id={run.id}
      data-status={status}
    >
      {variant === "timeline" ? (
        <span className="relative z-[1] mt-0.5 shrink-0">
          <AgentAvatar size="sm" working={live} name={run.agentName} />
        </span>
      ) : null}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col rounded-card border bg-surface",
          status === "WAITING_FOR_APPROVAL" ? "border-warning-border" : "border-border",
        )}
      >
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          {variant !== "timeline" ? (
            <AgentAvatar size="sm" working={live} name={run.agentName} />
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-small focus-ring"
          >
            <span className="font-medium text-fg">{run.agentName}</span>
            {variant === "compact" && (run.workItem || run.channel) ? (
              <span className="shrink-0 font-medium text-fg-secondary tabular">
                {run.workItem?.identifier ?? `#${run.channel?.name ?? t("directMessage")}`}
              </span>
            ) : null}
            <span className="min-w-0 truncate text-fg-muted">
              {tTrigger(run.trigger as "MANUAL", { name: who ?? t("someone") })}
            </span>
            <span className="shrink-0 text-fg-muted tabular" suppressHydrationWarning>
              {relative(run.createdAt)}
            </span>
          </button>
          <RunStatusPill status={status} />
          {live && d?.canStop ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => stop.mutate(run.id)}
              disabled={stop.isPending}
              data-testid="stop-run"
            >
              <CircleStop />
              {t("stop")}
            </Button>
          ) : null}
          {variant !== "page" ? (
            <Button variant="ghost" size="icon-xs" asChild aria-label={t("openRun")}>
              <Link href={`/${ws}/agent/runs/${run.id}` as never}>
                <ExternalLink />
              </Link>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={open ? t("collapse") : t("expand")}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </div>

        {run.untrusted || d?.untrusted ? (
          <div className="px-3.5 pb-2.5">
            <Banner tone="warning" title={t("untrustedTitle")}>
              {t("untrustedBody")}
              {(d?.untrustedReasons ?? run.untrustedReasons).length ? (
                <span className="mt-1 block font-mono text-caption text-fg-muted">
                  {(d?.untrustedReasons ?? run.untrustedReasons).join(" · ")}
                </span>
              ) : null}
            </Banner>
          </div>
        ) : null}

        {open ? (
          <div
            className="flex flex-col gap-3 border-t border-border px-3.5 py-3"
            data-testid="run-steps"
          >
            {detail.isPending ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : detail.isError ? (
              <p className="text-small text-danger-text">{t("loadError")}</p>
            ) : (
              <>
                {variant === "page" && d ? (
                  <details className="group rounded-control border border-border bg-surface-muted px-3 py-2">
                    <summary className="flex cursor-pointer items-center gap-1.5 text-small text-fg-secondary">
                      <FileText className="size-3.5 text-icon" aria-hidden />
                      {t("prompt")}
                    </summary>
                    <pre className="mt-2 max-h-96 overflow-auto font-mono text-caption whitespace-pre-wrap text-fg-secondary">
                      {d.prompt}
                    </pre>
                  </details>
                ) : null}
                {steps.length === 0 && live ? (
                  <p className="flex items-center gap-1.5 text-small text-fg-muted">
                    <Spinner size={12} />
                    {status === "QUEUED" ? t("queued") : t("thinking")}
                  </p>
                ) : null}
                {steps.map((s) => (
                  <Step
                    key={s.id}
                    ws={ws}
                    step={s}
                    canApprove={d?.canApprove ?? false}
                    untrusted={d?.untrusted ?? false}
                  />
                ))}
                {status === "FAILED" || status === "INTERRUPTED" ? (
                  <p className="text-small text-danger-text">{d?.error ?? t("failedRun")}</p>
                ) : null}
                {status === "CANCELLED" ? (
                  <p className="text-small text-fg-muted">
                    {d?.cancelReason === "agent_paused"
                      ? t("cancelledPaused")
                      : d?.cancelReason === "agent_unavailable"
                        ? t("cancelledUnavailable")
                        : t("cancelled")}
                  </p>
                ) : null}
                {status === "COMPLETED" && variant === "page" && d?.result ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-caption font-medium text-fg-muted">{t("result")}</span>
                    <p className="text-body whitespace-pre-wrap text-fg">{d.result}</p>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}
