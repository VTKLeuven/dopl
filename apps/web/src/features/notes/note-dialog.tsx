"use client";

import { useQueryState, parseAsString } from "nuqs";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Banner } from "@/components/ui/banner";
import { useNote } from "./data";
import { NoteCardView } from "./note-card";
import { suggestionOpen } from "./note-editor";
import type { Me } from "./capture";

/**
 * `?note=<id>` opens one note over the current page: the owner edits it in
 * place, everyone else reads it. Used by ⌘K results, Home and item notes.
 */
export function NoteDialog({ ws, me, onTag }: { ws: string; me: Me; onTag?: (p: string) => void }) {
  const t = useTranslations("notes");
  const [id, setId] = useQueryState("note", parseAsString);
  const { data: card, isError } = useNote(ws, id);
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && void setId(null)}>
      <DialogContent
        size="lg"
        data-testid="note-dialog"
        className="overflow-y-auto"
        onEscapeKeyDown={(e) => {
          if (suggestionOpen()) e.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">{t("dialogTitle")}</DialogTitle>
        {isError ? (
          <div className="p-5 pr-12">
            <Banner tone="warning" title={t("errors.notFound")} />
          </div>
        ) : card ? (
          <NoteCardView
            key={card.id}
            ws={ws}
            me={me}
            card={card}
            variant="dialog"
            onTag={(p) => {
              void setId(null);
              onTag?.(p);
            }}
          />
        ) : (
          <div className="flex flex-col gap-3 p-5 pr-12" aria-busy>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
