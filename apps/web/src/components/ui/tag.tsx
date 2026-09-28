import { cn } from "@/lib/cn";
import { tagClass } from "@/lib/palette";

/** Pastel label pill (Spott-style): tinted bg, saturated text, same-hue border. */
export function Tag({
  color,
  children,
  className,
  onRemove,
  removeLabel = "Remove",
}: {
  color: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-48 items-center gap-1 rounded-[7px] border px-2 text-small font-medium",
        tagClass(color).pill,
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="-mr-1 inline-flex size-4 items-center justify-center rounded-[4px] opacity-60 hover:opacity-100"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export function TagDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", tagClass(color).dot, className)} />;
}

/** "+3" overflow counter used after a few pills. */
export function Overflow({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="tabular text-small font-medium text-fg-muted">+{count}</span>;
}
