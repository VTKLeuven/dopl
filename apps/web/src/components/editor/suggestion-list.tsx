"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/cn";

export interface SuggestionItem {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** Popup list for @mentions and #references (keyboard-driven). */
export const SuggestionList = forwardRef<
  SuggestionListHandle,
  { items: SuggestionItem[]; command: (item: SuggestionItem) => void; emptyLabel: string }
>(function SuggestionList({ items, command, emptyLabel }, ref) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[index];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));
  return (
    <div
      className="w-72 overflow-hidden rounded-card border border-border bg-surface p-1 shadow-popover"
      role="listbox"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-small text-fg-muted">{emptyLabel}</p>
      ) : (
        items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={i === index}
            onMouseEnter={() => setIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-[8px] px-2 text-left text-body",
              i === index && "bg-neutral-150",
            )}
          >
            {item.icon}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint ? (
              <span className="shrink-0 text-small text-fg-muted tabular">{item.hint}</span>
            ) : null}
          </button>
        ))
      )}
    </div>
  );
});
