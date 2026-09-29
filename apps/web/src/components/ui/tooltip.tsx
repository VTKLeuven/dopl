"use client";

import { Tooltip as T } from "radix-ui";
import { cn } from "@/lib/cn";
import { Shortcut } from "./kbd";

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <T.Provider delayDuration={400} skipDelayDuration={200}>
    {children}
  </T.Provider>
);

export function Tooltip({
  content,
  shortcut,
  side = "top",
  align = "center",
  children,
  disabled,
}: {
  content: React.ReactNode;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (disabled) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            "z-[80] inline-flex max-w-72 items-center gap-2 rounded-chip bg-neutral-900 px-2 py-1 text-small font-medium text-white shadow-popover",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        >
          <span>{content}</span>
          {shortcut ? <Shortcut keys={shortcut} tone="inverted" /> : null}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
