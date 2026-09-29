import { cn } from "@/lib/cn";

/** Toolbar chips ("Sorted by …", "Filters", "Done hidden · 12") and link chips. */
export function Chip({
  className,
  active,
  asButton = true,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean; asButton?: boolean }) {
  const classes = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip border px-2.5 text-body text-fg-secondary",
    "transition-colors duration-[var(--dur-fast)] ease-out [&_svg]:size-4 [&_svg]:text-icon",
    active
      ? "border-sky-200 bg-sky-50 text-sky-800 [&_svg]:text-sky-700"
      : "border-border bg-surface hover:bg-surface-hover hover:text-fg",
    "focus-ring",
    className,
  );
  if (!asButton) return <span className={classes}>{props.children}</span>;
  return <button type="button" className={classes} {...props} />;
}
