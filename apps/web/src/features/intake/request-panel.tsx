"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown, FileText, Inbox, Mail, ShieldAlert, UserRound } from "lucide-react";
import type { RequestInfo } from "@/features/work-items/types";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/tooltip";

const SOURCE_ICON = {
  FORM: <FileText />,
  IN_APP: <UserRound />,
  EMAIL: <Mail />,
  API: <Inbox />,
} as const;

/**
 * Who asked, how, and what they answered. Shown on requests in triage and,
 * collapsed, on the work items they became ("one place").
 */
export function RequestPanel({
  ws,
  request,
  defaultOpen,
}: {
  ws: string;
  request: RequestInfo;
  defaultOpen: boolean;
}) {
  const t = useTranslations("intake");
  const format = useFormatter();
  const [open, setOpen] = useState(defaultOpen);
  const s = request.submitter;
  const answers = request.answers.filter((a) => a.value !== null && a.type !== "LONG_TEXT");
  return (
    <section
      className="rounded-card border border-border bg-surface-muted"
      data-testid="request-panel"
      aria-label={t("request")}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-card px-3.5 py-2.5 text-left focus-ring"
      >
        <span className="flex size-6 items-center justify-center rounded-[7px] border border-border bg-surface [&_svg]:size-3.5 [&_svg]:text-icon">
          {SOURCE_ICON[request.source]}
        </span>
        <span className="min-w-0 flex-1 truncate text-small">
          <span className="font-medium text-fg">{s?.name ?? t("unknownSubmitter")}</span>
          <span className="text-fg-muted">
            {" · "}
            {request.form?.title ?? t(`source.${request.source}`)}
            {" · "}
            <span className="tabular">{t("number", { number: request.number })}</span>
          </span>
        </span>
        <Tooltip content={t("untrustedHint")}>
          <span className="inline-flex items-center gap-1 text-caption font-medium text-lavender-700">
            <ShieldAlert className="size-3.5" aria-hidden />
            {t("untrusted")}
          </span>
        </Tooltip>
        <ChevronDown
          className={cn("size-4 text-icon transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-border px-3.5 py-3">
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[140px_1fr]">
            {s ? (
              <div className="contents">
                <dt className="text-small text-fg-muted">{t("submittedBy")}</dt>
                <dd className="min-w-0 text-body text-fg">
                  {s.kind === "contact" ? (
                    <Link
                      href={`/${ws}/contacts/${s.id}` as never}
                      className="text-link hover:underline"
                    >
                      {s.name}
                    </Link>
                  ) : (
                    s.name
                  )}
                  {s.email !== s.name ? <span className="text-fg-muted"> · {s.email}</span> : null}
                </dd>
              </div>
            ) : null}
            {request.triagedAt ? (
              <div className="contents">
                <dt className="text-small text-fg-muted">{t(`decided.${request.status}`)}</dt>
                <dd className="text-body text-fg">
                  {request.triagedByName ?? "—"} ·{" "}
                  <span className="tabular">
                    {format.dateTime(new Date(request.triagedAt), { dateStyle: "medium" })}
                  </span>
                  {request.duplicateOf ? (
                    <span className="text-fg-muted">
                      {" · "}
                      <Link
                        href={`/${ws}/i/${request.duplicateOf.identifier}` as never}
                        className="text-link tabular hover:underline"
                      >
                        {request.duplicateOf.identifier}
                      </Link>
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {request.declineReason ? (
              <div className="contents">
                <dt className="text-small text-fg-muted">{t("reason")}</dt>
                <dd className="text-body whitespace-pre-line text-fg">{request.declineReason}</dd>
              </div>
            ) : null}
            {answers.map((a) => (
              <div key={a.key} className="contents">
                <dt className="text-small text-fg-muted">{a.label}</dt>
                <dd className="text-body break-words text-fg">
                  {Array.isArray(a.value)
                    ? a.value.join(", ")
                    : typeof a.value === "boolean"
                      ? a.value
                        ? t("yes")
                        : t("no")
                      : a.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
