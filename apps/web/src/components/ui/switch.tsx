"use client";

import { Switch as S } from "radix-ui";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-transparent bg-neutral-300 p-px",
        "transition-colors duration-[var(--dur-fast)] ease-out data-[state=checked]:bg-sky-600",
        "disabled:cursor-not-allowed disabled:opacity-50 focus-ring",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-3.5 rounded-full bg-white shadow-xs transition-transform duration-[var(--dur-fast)] ease-out data-[state=checked]:translate-x-3" />
    </S.Root>
  );
}
