"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shortcut } from "@/components/ui/kbd";
import { SHORTCUTS, comboOf, isTypingTarget, type ShortcutScope } from "@/lib/shortcuts/registry";

const SEQUENCE_MS = 1200;
const GO: Record<string, string> = {
  h: "home",
  p: "projects",
  v: "views",
  s: "settings",
  i: "inbox",
  m: "messages",
};
const SCOPE_ORDER: ShortcutScope[] = [
  "global",
  "list",
  "table",
  "calendar",
  "timeline",
  "peek",
  "inbox",
  "messages",
];

/** `?` opens the shortcut overlay; `g` then a letter navigates (DESIGN_SYSTEM §7.1). */
export function GlobalShortcuts() {
  const router = useRouter();
  const params = useParams<{ ws?: string }>();
  const [help, setHelp] = useState(false);
  const pendingG = useRef<number>(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      const combo = comboOf(e);
      if (combo === "?") {
        e.preventDefault();
        setHelp((h) => !h);
        return;
      }
      const now = Date.now();
      if (pendingG.current && now - pendingG.current < SEQUENCE_MS) {
        pendingG.current = 0;
        const target = GO[combo];
        if (target && params.ws) {
          e.preventDefault();
          router.push(`/${params.ws}/${target}` as never);
        }
        return;
      }
      if (combo === "g") pendingG.current = now;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [params.ws, router]);

  return help ? <ShortcutsOverlay onClose={() => setHelp(false)} /> : null;
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const t = useTranslations("shortcuts");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" className="max-w-[1000px]" data-testid="shortcuts-overlay">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        {/* Columns flow the sections so short ones don't leave gaps. */}
        <DialogBody className="gap-x-8 pb-5 sm:columns-2 lg:columns-3">
          {SCOPE_ORDER.map((scope) => {
            const items = SHORTCUTS.filter((s) => s.scope === scope);
            if (items.length === 0) return null;
            return (
              <section key={scope} className="mb-5 flex break-inside-avoid flex-col gap-1">
                <h3 className="mb-1 text-caption font-medium tracking-wide text-fg-muted uppercase">
                  {t(`scope.${scope}`)}
                </h3>
                {items.map((s) => (
                  <div key={s.id} className="flex h-7 items-center justify-between gap-4 text-body">
                    <span className="truncate text-fg-secondary">{t(`label.${s.id}`)}</span>
                    <Shortcut keys={s.keys} />
                  </div>
                ))}
              </section>
            );
          })}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
