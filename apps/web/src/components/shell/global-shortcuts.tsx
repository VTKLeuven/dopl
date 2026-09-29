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
const GO: Record<string, string> = { h: "home", p: "projects", v: "views", s: "settings" };
const SCOPE_ORDER: ShortcutScope[] = ["global", "list", "table", "calendar", "timeline", "peek"];

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
      <DialogContent size="lg" data-testid="shortcuts-overlay">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="grid gap-x-8 gap-y-5 pb-5 sm:grid-cols-2">
          {SCOPE_ORDER.map((scope) => {
            const items = SHORTCUTS.filter((s) => s.scope === scope);
            if (items.length === 0) return null;
            return (
              <section key={scope} className="flex flex-col gap-1">
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
