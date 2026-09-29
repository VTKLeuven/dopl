"use client";

import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from "./suggestion-list";

/** Renders the suggestion popup in a fixed-position container at the caret. */
export function suggestionRenderer(emptyLabel: string): SuggestionOptions<SuggestionItem>["render"] {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle, { items: SuggestionItem[]; command: (i: SuggestionItem) => void; emptyLabel: string }> | null = null;
    let container: HTMLDivElement | null = null;

    const place = (props: SuggestionProps<SuggestionItem>) => {
      const rect = props.clientRect?.();
      if (!rect || !container) return;
      const below = rect.bottom + 6;
      const fitsBelow = below + 280 < window.innerHeight;
      container.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
      container.style.top = fitsBelow ? `${below}px` : `${Math.max(8, rect.top - 6 - (container.offsetHeight || 200))}px`;
    };

    return {
      onStart: (props) => {
        container = document.createElement("div");
        container.style.position = "fixed";
        container.style.zIndex = "45";
        document.body.appendChild(container);
        renderer = new ReactRenderer(SuggestionList, {
          props: { items: props.items, command: props.command, emptyLabel },
          editor: props.editor,
        });
        container.appendChild(renderer.element);
        place(props);
      },
      onUpdate: (props) => {
        renderer?.updateProps({ items: props.items, command: props.command, emptyLabel });
        place(props);
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === "Escape") return false;
        return renderer?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit: () => {
        renderer?.destroy();
        container?.remove();
        renderer = null;
        container = null;
      },
    };
  };
}
