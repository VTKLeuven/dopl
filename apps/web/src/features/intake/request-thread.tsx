"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Check, CircleDot, Paperclip, X } from "lucide-react";
import type { PublicStatus } from "@dopl/shared/schemas/intake";
import type { PublicRequestView } from "@/server/queries/intake";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { RichTextView } from "@/components/editor/rich-text-view";
import { formatSize } from "./public-form";

export type ReplyResult = { ok: true } | { ok: false; error: string };

const STEPS: PublicStatus[] = ["received", "in_progress", "resolved"];

export function StatusBadge({ status }: { status: PublicStatus }) {
  const t = useTranslations("requests.status");
  const tone: Record<PublicStatus, string> = {
    received: "border-lavender-200 bg-lavender-50 text-lavender-700",
    in_progress: "border-warning-border bg-warning-bg text-warning-text",
    resolved: "border-success-border bg-success-bg text-success-text",
    declined: "border-border-strong bg-neutral-100 text-fg-secondary",
    duplicate: "border-border-strong bg-neutral-100 text-fg-secondary",
  };
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-[7px] border px-2 text-small font-medium",
        tone[status],
      )}
      data-testid="request-status"
    >
      <CircleDot className="size-3" aria-hidden />
      {t(status)}
    </span>
  );
}

/** Received → In progress → Resolved, or a closed state (Q-12). */
function Progress({ status }: { status: PublicStatus }) {
  const t = useTranslations("requests.status");
  if (status === "declined" || status === "duplicate") return null;
  const at = STEPS.indexOf(status);
  return (
    <ol className="flex items-center gap-2" aria-label={t("progress")}>
      {STEPS.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full border",
              i <= at ? "border-sky-600 bg-sky-600 text-white" : "border-border-strong bg-surface",
            )}
            aria-hidden
          >
            {i <= at ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
          <span
            className={cn("truncate text-small", i <= at ? "font-medium text-fg" : "text-fg-muted")}
            aria-current={i === at ? "step" : undefined}
          >
            {t(s)}
          </span>
          {i < STEPS.length - 1 ? (
            <span className={cn("h-px flex-1", i < at ? "bg-sky-600" : "bg-border")} aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * What a submitter sees of their request: the simplified status, their own
 * answers and files, the public conversation and a reply box. Used by the
 * contact status page (/s/<token>) and a guest's request page.
 */
export function RequestThread({
  view,
  onReply,
  onUpload,
  fileHref,
  showHeader = true,
}: {
  view: PublicRequestView;
  onReply: (text: string, attachmentIds: string[]) => Promise<ReplyResult>;
  onUpload?: (file: File) => Promise<{ id: string } | { error: string }>;
  fileHref: (id: string) => string;
  showHeader?: boolean;
}) {
  const t = useTranslations("requests");
  const format = useFormatter();
  const relative = useRelativeTime();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Array<{ id: string | null; name: string; error?: string }>>(
    [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = view.status === "declined" || view.status === "duplicate";

  const send = async () => {
    if (!text.trim() || pending) return;
    setPending(true);
    setError(null);
    const res = await onReply(
      text.trim(),
      files.flatMap((f) => (f.id ? [f.id] : [])),
    );
    setPending(false);
    if (res.ok) {
      setText("");
      setFiles([]);
    } else setError(res.error === "rate_limited" ? t("rateLimited") : t("replyFailed"));
  };

  return (
    <div className="flex flex-col gap-6" data-testid="request-thread">
      {showHeader ? (
        <header className="flex flex-col gap-3">
          <p className="text-small font-medium text-fg-muted">
            {view.workspaceName} · {view.formTitle ?? view.projectName} ·{" "}
            <span className="tabular">{t("number", { number: view.number })}</span>
          </p>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="min-w-0 text-title-lg font-semibold tracking-[-0.012em] text-fg">
              {view.title}
            </h1>
            <StatusBadge status={view.status} />
          </div>
          <p className="text-small text-fg-muted">
            {t("submittedOn", {
              date: format.dateTime(new Date(view.createdAt), { dateStyle: "long" }),
            })}
          </p>
          <Progress status={view.status} />
          {view.status === "declined" ? (
            <Banner tone="info" title={t("declinedTitle")}>
              {view.declineReason ? (
                <span className="whitespace-pre-line">{view.declineReason}</span>
              ) : null}
            </Banner>
          ) : null}
          {view.status === "duplicate" ? <Banner tone="info" title={t("duplicateTitle")} /> : null}
        </header>
      ) : null}

      {view.description || view.answers.some((a) => a.value !== null) || view.files.length ? (
        <section className="flex flex-col gap-3 rounded-card border border-border bg-surface-muted p-4">
          <h2 className="text-small font-semibold text-fg-secondary">{t("yourRequest")}</h2>
          {view.description ? <RichTextView doc={view.description} /> : null}
          {view.answers.length ? (
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[160px_1fr]">
              {view.answers
                .filter((a) => a.value !== null && a.type !== "LONG_TEXT")
                .map((a) => (
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
          ) : null}
          {view.files.length ? (
            <ul className="flex flex-wrap gap-2">
              {view.files.map((f) => (
                <li key={f.id}>
                  <a
                    href={fileHref(f.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-chip border border-border bg-surface px-2.5 text-small text-fg-secondary focus-ring hover:bg-surface-hover"
                  >
                    <Paperclip className="size-3.5 text-icon" aria-hidden />
                    <span className="max-w-56 truncate">{f.filename}</span>
                    <span className="text-fg-muted tabular">{formatSize(f.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-label={t("conversation")}>
        <h2 className="text-small font-semibold text-fg-secondary">{t("conversation")}</h2>
        {view.comments.length === 0 ? (
          <p className="text-body text-fg-muted">{t("noReplies")}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {view.comments.map((c) => (
              <li key={c.id} className="flex gap-2.5" data-testid="request-comment">
                <Avatar user={{ id: c.author.name, name: c.author.name, image: null }} size="sm" />
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-card border px-3.5 py-2.5",
                    c.author.mine ? "border-sky-200 bg-sky-50" : "border-border bg-surface",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 text-small">
                    <span className="font-medium text-fg">
                      {c.author.mine ? t("you") : c.author.name}
                    </span>
                    {c.author.team ? (
                      <span className="text-caption text-fg-muted">
                        {t("teamOf", { name: view.workspaceName })}
                      </span>
                    ) : null}
                    <span className="text-fg-muted tabular">{relative(c.createdAt)}</span>
                  </div>
                  <RichTextView doc={c.body} className="mt-1" />
                </div>
              </li>
            ))}
          </ol>
        )}
        {closed ? null : (
          <div className="flex flex-col gap-2 rounded-card border border-border-strong bg-surface p-3 shadow-xs">
            <label htmlFor="request-reply" className="sr-only">
              {t("replyLabel")}
            </label>
            <Textarea
              id="request-reply"
              rows={3}
              value={text}
              placeholder={t("replyPlaceholder")}
              className="border-0 px-1 shadow-none focus-visible:ring-0"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
              }}
            />
            {files.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="inline-flex h-7 items-center gap-1 rounded-chip border border-border px-2 text-small"
                  >
                    <Paperclip className="size-3 text-icon" aria-hidden />
                    <span className={cn("max-w-40 truncate", f.error && "text-danger-text")}>
                      {f.error ?? f.name}
                    </span>
                    <button
                      type="button"
                      className="rounded-[4px] text-icon focus-ring hover:text-fg"
                      aria-label={t("removeFile")}
                      onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {error ? <p className="text-caption text-danger-text">{error}</p> : null}
            <div className="flex items-center justify-between gap-2">
              {onUpload ? (
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] px-2.5 text-body text-fg-secondary focus-within:outline-2 focus-within:outline-focus hover:bg-neutral-150">
                  <Paperclip className="size-4 text-icon" aria-hidden />
                  {t("attach")}
                  <input
                    type="file"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const index = files.length;
                      setFiles((all) => [...all, { id: null, name: file.name }]);
                      const res = await onUpload(file);
                      setFiles((all) =>
                        all.map((f, j) =>
                          j === index
                            ? "id" in res
                              ? { ...f, id: res.id }
                              : { ...f, error: t("uploadFailed") }
                            : f,
                        ),
                      );
                    }}
                  />
                </label>
              ) : (
                <span />
              )}
              <Button variant="primary" size="sm" loading={pending} onClick={() => void send()}>
                {t("send")}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
