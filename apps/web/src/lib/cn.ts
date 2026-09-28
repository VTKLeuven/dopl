import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about our custom text-size tokens so `text-body`
// and `text-fg` aren't treated as the same group.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "title-lg", "title", "nav", "body", "small", "caption", "micro"] },
      ],
      shadow: [{ shadow: ["xs", "card", "popover", "dialog", "drag"] }],
      rounded: [{ rounded: ["chip", "control", "card", "panel"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
