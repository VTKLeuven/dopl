"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { StateIcon } from "@/components/icons/state-icon";
import type { ItemRefInfo } from "./types";

/**
 * `#INFRA-42` in chat (DESIGN_SYSTEM §5 ItemRefChip): state icon, identifier
 * and title, linking to the item. Items the reader can't see stay plain text.
 */
export function ItemChip({
  ws,
  item,
  label,
  className,
}: {
  ws: string;
  item: ItemRefInfo | undefined;
  label: string;
  className?: string;
}) {
  if (!item) return <span className="item-ref">{label}</span>;
  return (
    <Link
      href={`/${ws}/i/${item.identifier}` as never}
      title={`${item.identifier} ${item.title}`}
      data-testid="item-chip"
      className={cn(
        "mx-0.5 inline-flex h-[22px] max-w-[320px] translate-y-[3px] items-center gap-1 rounded-[6px] border border-border bg-surface px-1.5 align-baseline text-small no-underline shadow-xs",
        "transition-colors duration-[var(--dur-fast)] hover:border-border-strong hover:bg-surface-hover",
        className,
      )}
    >
      <StateIcon group={item.stateGroup} color={item.stateColor} size={12} />
      <span className="shrink-0 font-medium text-fg-muted tabular">{item.identifier}</span>
      <span className="truncate text-fg">{item.title}</span>
    </Link>
  );
}
