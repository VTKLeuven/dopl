"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MessagesSquare } from "lucide-react";
import { useRelativeTime } from "@/lib/use-relative-time";
import type { ReferenceView } from "@/features/work-items/types";

/**
 * A chat reference on a work item's timeline (DESIGN_SYSTEM §4.5): "created
 * from a message in #infra" or "mentioned in #general", with the snippet and
 * a link back to the message.
 */
export function ReferenceEntry({ ws, r }: { ws: string; r: ReferenceView }) {
  const t = useTranslations("messages");
  const relative = useRelativeTime();
  const m = r.message;
  const where = m.channelName ? `#${m.channelName}` : t("aDirectMessage");
  const href = m.threadRootId
    ? `/${ws}/messages/c/${m.channelId}?thread=${m.threadRootId}`
    : `/${ws}/messages/c/${m.channelId}?msg=${m.id}`;
  const who = (r.kind === "CREATED_FROM" ? r.actorName : m.authorName) ?? t("someone");
  return (
    <li className="relative flex gap-2" data-testid="timeline-reference">
      <span className="relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface">
        <MessagesSquare className="size-3.5 text-icon" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-small text-fg-muted">
          <span className="font-medium text-fg-secondary">{who}</span>{" "}
          {r.kind === "CREATED_FROM"
            ? t("ref.createdFrom", { where })
            : t("ref.mentioned", { where })}
          <span className="tabular"> · {relative(r.createdAt)}</span>
        </p>
        <Link
          href={href as never}
          className="mt-1 block rounded-card border border-border bg-surface-muted px-3 py-2 text-small text-fg-secondary hover:bg-surface-hover"
        >
          {m.authorName ? <span className="font-medium text-fg">{m.authorName}: </span> : null}
          <span className="line-clamp-3 whitespace-pre-line">{m.excerpt}</span>
        </Link>
      </div>
    </li>
  );
}
