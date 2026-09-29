"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Clock, ShieldAlert, ShieldQuestion, X } from "lucide-react";
import type { AgentApprovalView } from "@/server/queries/agent";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDecideApproval } from "./data";

const ENV_CLASS: Record<string, string> = {
  PRODUCTION: "border-danger-border bg-danger-bg text-danger-text",
  STAGING: "border-warning-border bg-warning-bg text-warning-text",
  LAB: "border-border bg-surface-muted text-fg-secondary",
};

export function EnvBadge({ environment }: { environment: string }) {
  const t = useTranslations("agent.env");
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-[6px] border px-1.5 text-caption font-medium",
        ENV_CLASS[environment] ?? ENV_CLASS.LAB,
      )}
    >
      {t(environment as "LAB")}
    </span>
  );
}

const RISK_CLASS: Record<string, string> = {
  untrusted_input: "border-warning-border bg-warning-bg text-warning-text",
  production_host: "border-danger-border bg-danger-bg text-danger-text",
  destructive_pattern: "border-danger-border bg-danger-bg text-danger-text",
  privilege_escalation: "border-danger-border bg-danger-bg text-danger-text",
};

/**
 * DESIGN_SYSTEM §6 ApprovalCard: the exact command and host, the agent's
 * (unverified) reason, risk flags, and Approve / Deny with an optional
 * note. Production hosts ask once more before approving.
 */
export function ApprovalCard({
  ws,
  approval: a,
  canApprove,
  untrusted,
}: {
  ws: string;
  approval: AgentApprovalView;
  canApprove: boolean;
  untrusted?: boolean;
}) {
  const t = useTranslations("agent.approval");
  const tr = useTranslations("agent.risk");
  const relative = useRelativeTime();
  const decide = useDecideApproval(ws);
  const [note, setNote] = useState("");
  const [denying, setDenying] = useState(false);
  const [confirmProd, setConfirmProd] = useState(false);
  const pending = a.status === "PENDING";
  const production = a.host?.environment === "PRODUCTION";

  const approve = () => decide.mutate({ id: a.id, decision: "APPROVE", note: note || undefined });
  const title =
    a.kind === "INFRA_COMMAND"
      ? t("titleCommand")
      : a.kind === "MCP_WRITE"
        ? t("titleWrite")
        : t("titleRuntime", { tool: a.toolName ?? "tool" });

  return (
    <div
      data-testid="approval-card"
      data-status={a.status}
      className={cn(
        "flex flex-col gap-3 rounded-card border bg-surface p-3.5",
        pending ? "border-warning-border shadow-sm" : "border-border",
      )}
    >
      <div className="flex items-start gap-2">
        {pending ? (
          <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
        ) : a.status === "APPROVED" ? (
          <Check className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
        ) : (
          <X className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-body font-medium text-fg">{title}</p>
          {a.host ? (
            <p className="flex flex-wrap items-center gap-1.5 text-small text-fg-secondary">
              <span className="font-medium text-fg">{a.host.name}</span>
              <EnvBadge environment={a.host.environment} />
              <span className="text-fg-muted">{t("viaWarpgate", { target: a.host.warpgateTarget })}</span>
            </p>
          ) : null}
        </div>
      </div>

      <pre
        className="max-h-48 overflow-auto rounded-control bg-neutral-900 px-3 py-2 font-mono text-small break-all whitespace-pre-wrap text-neutral-100"
        data-testid="approval-command"
      >
        {a.command}
      </pre>

      {a.agentReason ? (
        <div className="flex flex-col gap-0.5 border-l-2 border-border-strong pl-2.5">
          <span className="text-caption font-medium text-fg-muted">{t("reasonLabel")}</span>
          <p className="text-small whitespace-pre-wrap text-fg-secondary">{a.agentReason}</p>
        </div>
      ) : null}

      {a.riskFlags.length > 0 || untrusted ? (
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([...a.riskFlags, ...(untrusted ? ["untrusted_input"] : [])])].map((f) => (
            <span
              key={f}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-[7px] border px-2 text-caption font-medium",
                RISK_CLASS[f] ?? "border-border bg-surface-muted text-fg-secondary",
              )}
            >
              {f === "untrusted_input" ? <ShieldAlert className="size-3" aria-hidden /> : null}
              {tr(f as "untrusted_input")}
            </span>
          ))}
        </div>
      ) : null}

      {pending ? (
        canApprove ? (
          <div className="flex flex-col gap-2">
            {denying ? (
              <Input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("notePlaceholder")}
                aria-label={t("noteLabel")}
                maxLength={500}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    decide.mutate({ id: a.id, decision: "DENY", note: note || undefined });
                  if (e.key === "Escape") setDenying(false);
                }}
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {denying ? (
                <>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: a.id, decision: "DENY", note: note || undefined })}
                    data-testid="deny-confirm"
                  >
                    <X />
                    {t("deny")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDenying(false)}>
                    {t("cancel")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => (production ? setConfirmProd(true) : approve())}
                    data-testid="approve"
                  >
                    <Check />
                    {t("approve")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => setDenying(true)}
                    data-testid="deny"
                  >
                    <X />
                    {t("deny")}
                  </Button>
                </>
              )}
              <span
                className="ml-auto inline-flex items-center gap-1 text-caption text-fg-muted"
                suppressHydrationWarning
              >
                <Clock className="size-3" aria-hidden />
                {t("expires", { when: relative(a.expiresAt) })}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-small text-fg-muted">{t("waitingForApprover")}</p>
        )
      ) : (
        <p className="text-small text-fg-secondary" suppressHydrationWarning>
          {a.status === "APPROVED"
            ? t("approvedBy", { name: a.decidedBy ?? "?", when: relative(a.decidedAt ?? a.requestedAt) })
            : a.status === "DENIED"
              ? t("deniedBy", { name: a.decidedBy ?? "?", when: relative(a.decidedAt ?? a.requestedAt) })
              : a.status === "EXPIRED"
                ? t("expired")
                : t("cancelled")}
          {a.decisionNote && a.status !== "CANCELLED" ? (
            <span className="text-fg-muted"> · “{a.decisionNote}”</span>
          ) : null}
        </p>
      )}

      <Dialog open={confirmProd} onOpenChange={setConfirmProd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("prodConfirmTitle", { host: a.host?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("prodConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <pre className="rounded-control bg-neutral-900 px-3 py-2 font-mono text-small break-all whitespace-pre-wrap text-neutral-100">
              {a.command}
            </pre>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmProd(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              data-testid="approve-production"
              onClick={() => {
                setConfirmProd(false);
                approve();
              }}
            >
              {t("approveOnProduction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
