"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-left"
      gap={8}
      visibleToasts={4}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[360px] items-center gap-2.5 rounded-card border border-border bg-surface px-3.5 py-3 text-body text-fg shadow-popover",
          title: "font-medium",
          description: "text-fg-muted",
          actionButton:
            "ml-auto inline-flex h-7 shrink-0 items-center rounded-chip bg-primary px-2.5 text-small font-medium text-on-primary hover:bg-primary-hover",
          cancelButton:
            "inline-flex h-7 shrink-0 items-center rounded-chip px-2 text-small font-medium text-fg-muted hover:bg-neutral-150",
          error: "[&_[data-icon]]:text-danger",
          success: "[&_[data-icon]]:text-success",
        },
      }}
    />
  );
}
