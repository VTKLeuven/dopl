"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isTypingTarget, resolveShortcut } from "@/lib/shortcuts/registry";
import type { PaletteData } from "@/server/queries/palette";
import { CaptureComposer } from "./capture";
import { suggestionOpen } from "./note-editor";

const OPEN_EVENT = "dopl:quick-note";

/** Opens the quick-capture dialog from anywhere (⌘K "New note", buttons). */
export function openQuickCapture() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** `Q` from anywhere in the workspace: a note in two keystrokes (DESIGN_SYSTEM §7.1). */
export function QuickCapture() {
  const t = useTranslations("notes.capture");
  const params = useParams<{ ws?: string }>();
  const ws = params.ws ?? "";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || isTypingTarget(e.target)) return;
      if (resolveShortcut(e, ["global"]) === "quickNote") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Who we are, for the optimistic card (shared with the ⌘K palette's cache).
  const { data: me } = useQuery({
    queryKey: ["palette", ws],
    queryFn: async () => {
      const res = await fetch(`/api/v1/${ws}/palette`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as PaletteData;
    },
    enabled: Boolean(ws),
    staleTime: 30_000,
    select: (d) => d.members.find((m) => m.id === d.me) ?? { id: d.me, name: "", image: null },
  });

  if (!ws) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="md"
        data-testid="quick-capture"
        onEscapeKeyDown={(e) => {
          if (suggestionOpen()) e.preventDefault();
        }}
      >
        <DialogHeader className="pb-0">
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
        </DialogHeader>
        {open && me ? (
          <CaptureComposer
            ws={ws}
            me={me}
            variant="dialog"
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        ) : (
          <div className="h-[212px]" aria-hidden />
        )}
      </DialogContent>
    </Dialog>
  );
}
