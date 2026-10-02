"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock, Mail, MailOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import type { EmailReferenceView } from "@/features/work-items/types";

const threadHref = (ws: string, id: string) => `/${ws}/mail?thread=${id}`;

/** "Bram created this from an email" / "linked an email conversation" on an item's timeline. */
export function EmailReferenceEntry({ ws, r }: { ws: string; r: EmailReferenceView }) {
  const t = useTranslations("mail.timeline");
  const relative = useRelativeTime();
  return (
    <li className="relative flex gap-2" data-testid="timeline-email-reference">
      <span className="relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface">
        <Mail className="size-3.5 text-icon" />
      </span>
      <p className="min-w-0 flex-1 text-small text-fg-muted">
        <span className="font-medium text-fg-secondary">{r.actorName ?? t("someone")}</span>{" "}
        {r.kind === "CREATED_FROM" ? t("createdFrom") : t("linked")}{" "}
        {r.thread.readable ? (
          <Link
            href={threadHref(ws, r.thread.id) as never}
            className="font-medium text-link hover:underline"
          >
            {r.thread.subject}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3" />
            {r.thread.personal ? t("personal") : t("private", { mailbox: r.thread.mailbox })}
          </span>
        )}
        <span className="tabular" suppressHydrationWarning>
          {" "}
          · {relative(r.createdAt)}
        </span>
      </p>
    </li>
  );
}

/** One email of a linked conversation; replies that arrive later appear here live. */
export function EmailMessageEntry({
  ws,
  r,
  m,
}: {
  ws: string;
  r: EmailReferenceView;
  m: EmailReferenceView["thread"]["messages"][number];
}) {
  const t = useTranslations("mail.timeline");
  const relative = useRelativeTime();
  const outbound = m.direction === "OUTBOUND";
  return (
    <li className="relative flex gap-2" data-testid="timeline-email" data-direction={m.direction}>
      <span className="relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface">
        <MailOpen className="size-3.5 text-icon" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-small text-fg-muted">
          <span className="font-medium text-fg-secondary">{m.from}</span>{" "}
          {outbound ? t("replied") : t("wrote")}
          <span className="tabular" suppressHydrationWarning>
            {" "}
            · {relative(m.sentAt)}
          </span>
        </p>
        <Link
          href={threadHref(ws, r.thread.id) as never}
          className={cn(
            "mt-1 block rounded-card border px-3 py-2 text-small text-fg-secondary hover:bg-surface-hover",
            outbound ? "border-sky-200 bg-surface" : "border-border bg-surface-muted",
          )}
        >
          <span className="line-clamp-4 whitespace-pre-line">{m.excerpt}</span>
        </Link>
      </div>
    </li>
  );
}
