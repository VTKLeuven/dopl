"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { StickyNote } from "lucide-react";
import { noteTitle } from "@dopl/shared/domain/notes";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { useNotes } from "./data";
import { cardColorClass } from "./note-actions";

/**
 * Notes on a work item's detail: notes attached to the item, and the note it
 * was converted from ("link back"). Only notes the viewer may see are listed;
 * the section is absent when there are none.
 */
export function ItemNotes({ ws, itemId }: { ws: string; itemId: string }) {
  const t = useTranslations("notes.item");
  const { data: notes } = useNotes(ws, { filter: "all", item: itemId });
  if (!notes || notes.length === 0) return null;
  return (
    <section data-testid="item-notes">
      <div className="flex h-8 items-center gap-2">
        <h3 className="text-body font-semibold text-fg">{t("title")}</h3>
        <span className="text-small text-fg-muted tabular">{notes.length}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {notes.map((n) => {
          const source = n.convertedTo?.id === itemId || n.workItem?.id !== itemId;
          return (
            <li key={n.id}>
              <Link
                href={`/${ws}/notes?note=${n.id}` as never}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 rounded-control border px-3 py-2 text-body focus-ring hover:shadow-card",
                  cardColorClass(n.color),
                )}
              >
                <StickyNote className="size-4 shrink-0 text-icon" />
                <span className="min-w-0 flex-1 truncate text-fg">
                  {noteTitle(n.contentText) || t("untitled")}
                </span>
                <span className="shrink-0 text-caption text-fg-muted">
                  {source ? t("source") : t("attached")}
                </span>
                <Avatar user={n.owner} size="xs" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
