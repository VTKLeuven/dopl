"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

const noop = () => () => {};
function detectMac() {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}
/** ⌘ on the server and during hydration, the real platform afterwards. */
export function useIsMac() {
  return useSyncExternalStore(noop, detectMac, () => true);
}

/** Renders "mod" as ⌘ on macOS and Ctrl elsewhere. */
export function formatKey(key: string, isMac = true): string {
  switch (key.toLowerCase()) {
    case "mod":
      return isMac ? "⌘" : "Ctrl";
    case "shift":
      return "⇧";
    case "alt":
      return isMac ? "⌥" : "Alt";
    case "enter":
      return "↵";
    case "backspace":
      return "⌫";
    case "esc":
      return "Esc";
    case "up":
      return "↑";
    case "down":
      return "↓";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

export function Kbd({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "inverted";
}) {
  return (
    <kbd
      className={cn(
        "tabular inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border px-1 font-sans text-micro font-medium",
        tone === "default" && "border-border-strong bg-surface text-fg-muted",
        tone === "inverted" && "border-white/20 bg-white/10 text-white/80",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** A shortcut like "mod+k" or a sequence like "g i" → a row of keycaps. */
export function Shortcut({
  keys,
  tone,
  className,
}: {
  keys: string;
  tone?: "default" | "inverted";
  className?: string;
}) {
  const isMac = useIsMac();
  const sequence = keys.split(" ");
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-hidden>
      {sequence.map((combo, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {combo.split("+").map((k) => (
            <Kbd key={k} tone={tone}>
              {formatKey(k, isMac)}
            </Kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
