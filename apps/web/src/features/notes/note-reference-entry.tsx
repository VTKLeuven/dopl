"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock, StickyNote } from "lucide-react";
import { useRelativeTime } from "@/lib/use-relative-time";
import type { NoteReferenceView } from "@/features/work-items/types";

/**
 * "Created this from a note" on a work item's timeline, with the line or the
 * note's opening text and a link back. A note the reader can't open shows
 * only that it exists.
 */
export function NoteReferenceEntry({ ws, r }: { ws: string; r: NoteReferenceView }) {
  const t = useTranslations("notes.item");
  const relative = useRelativeTime();
  const n = r.note;
  return (
    <li className="relative flex gap-2" data-testid="timeline-note-reference">
      <span className="relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface">
        <StickyNote className="size-3.5 text-icon" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-small text-fg-muted">
          <span className="font-medium text-fg-secondary">{r.actorName ?? t("someone")}</span>{" "}
          {n.line !== null ? t("createdFromLine") : t("createdFromNote")}
          <span className="tabular"> · {relative(r.createdAt)}</span>
        </p>
        {n.excerpt === null ? (
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-card border border-border bg-surface-muted px-3 py-2 text-small text-fg-muted">
            <Lock className="size-3.5" />
            {t("privateNote", { owner: n.ownerName ?? t("someone") })}
          </p>
        ) : (
          <Link
            href={`/${ws}/notes?note=${n.id}` as never}
            className="mt-1 block rounded-card border border-border bg-surface-muted px-3 py-2 text-small text-fg-secondary hover:bg-surface-hover"
          >
            <span className="line-clamp-3 whitespace-pre-line">{n.line ?? n.excerpt}</span>
          </Link>
        )}
      </div>
    </li>
  );
}
