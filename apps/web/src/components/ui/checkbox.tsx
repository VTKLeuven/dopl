"use client";

import { Checkbox as C } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      data-slot="checkbox"
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-neutral-300 bg-surface shadow-xs",
        "transition-colors duration-[var(--dur-fast)] ease-out hover:border-neutral-400",
        "data-[state=checked]:border-sky-600 data-[state=checked]:bg-sky-600",
        "data-[state=indeterminate]:border-sky-600 data-[state=indeterminate]:bg-sky-600",
        "focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <C.Indicator className="flex items-center justify-center text-white">
        {props.checked === "indeterminate" ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </C.Indicator>
    </C.Root>
  );
}
