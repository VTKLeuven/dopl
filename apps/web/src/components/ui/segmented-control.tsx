"use client";

import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/cn";

export function SegmentedControl({
  value,
  onValueChange,
  className,
  children,
  label,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v);
      }}
      aria-label={label}
      className={cn(
        "inline-flex h-8 items-center gap-0.5 rounded-control bg-neutral-150 p-0.5",
        className,
      )}
    >
      {children}
    </ToggleGroup.Root>
  );
}

export function SegmentedControlItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroup.Item>) {
  return (
    <ToggleGroup.Item
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-[8px] px-2 text-small font-medium text-fg-muted",
        "focus-ring transition-colors duration-[var(--dur-fast)] ease-out hover:text-fg",
        "data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-xs",
        "[&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
