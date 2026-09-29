"use client";

import { useTranslations } from "next-intl";
import { ListChecks, Repeat2, StickyNote, StickyNote as NoteIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { tagClass } from "@/lib/palette";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { keysFor } from "@/lib/shortcuts/registry";
import { useNoteSearch } from "./data";
import { openQuickCapture } from "./quick-capture";

/**
 * ⌘K "Notes" group: matching notes while searching (trigram, server side),
 * plus note commands. Values start with "note:" so cmdk keeps server matches.
 */
export function PaletteNotes({
  ws,
  query,
  go,
  close,
  part,
}: {
  ws: string;
  query: string;
  go: (href: string) => void;
  close: () => void;
  part: "results" | "commands";
}) {
  const t = useTranslations("notes.palette");
  const { data: hits = [] } = useNoteSearch(ws, query, part === "results" && query.length > 0);
  const base = `/${ws}`;
  if (part === "results")
    return query && hits.length > 0 ? (
      <CommandGroup heading={t("group")}>
        {hits.map((h) => (
          <CommandItem
            key={h.id}
            value={`note:${h.id}`}
            onSelect={() => go(`${base}/notes?note=${h.id}`)}
            data-testid="palette-note"
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] border",
                h.color ? tagClass(h.color).pill : "border-border-strong bg-surface",
              )}
            >
              <NoteIcon className="size-2.5!" />
            </span>
            <span className="min-w-0 flex-1 truncate">{h.title || t("untitled")}</span>
            <span className="ml-auto max-w-[45%] shrink truncate text-small text-fg-muted">
              {h.mine ? h.excerpt : t("by", { name: h.ownerName })}
            </span>
          </CommandItem>
        ))}
      </CommandGroup>
    ) : null;
  return (
    <CommandGroup heading={t("commands")}>
      <CommandItem
        value="new note quick capture"
        shortcut={keysFor("quickNote")}
        onSelect={() => {
          close();
          openQuickCapture();
        }}
      >
        <StickyNote className="text-icon" />
        {t("newNote")}
      </CommandItem>
      <CommandItem
        value="go notes"
        shortcut={keysFor("goNotes")}
        onSelect={() => go(`${base}/notes`)}
      >
        <StickyNote className="text-icon" />
        {t("goNotes")}
      </CommandItem>
      <CommandItem value="go my to-dos todos checklist" onSelect={() => go(`${base}/notes/todos`)}>
        <ListChecks className="text-icon" />
        {t("goTodos")}
      </CommandItem>
      <CommandItem value="daily review notes resurface" onSelect={() => go(`${base}/notes/review`)}>
        <Repeat2 className="text-icon" />
        {t("goReview")}
      </CommandItem>
    </CommandGroup>
  );
}
