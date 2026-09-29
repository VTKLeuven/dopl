"use client";

import { ItemDetail } from "./item-detail";

/**
 * Right-side peek (DESIGN_SYSTEM §4.5): slides over the view inside the panel;
 * the list stays interactive; the URL (?peek=INFRA-42) makes it shareable.
 */
export function PeekPanel({
  ws,
  itemRef,
  onClose,
}: {
  ws: string;
  itemRef: string | null;
  onClose: () => void;
}) {
  if (!itemRef) return null;
  return (
    <aside
      aria-label={itemRef}
      data-testid="peek"
      className="absolute inset-y-0 right-0 z-[30] flex w-full animate-in flex-col border-l border-border bg-surface shadow-popover duration-[var(--dur-slow)] fade-in-0 slide-in-from-right-8 md:w-[min(600px,62%)]"
    >
      <ItemDetail ws={ws} itemRef={itemRef} mode="peek" onClose={onClose} />
    </aside>
  );
}
