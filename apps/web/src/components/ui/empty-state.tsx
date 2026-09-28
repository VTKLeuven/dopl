import { cn } from "@/lib/cn";

/** Designed empty state: brand-tinted icon, one line, one action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-8" : "gap-3 py-16", className)}>
      {icon ? (
        <div className="relative mb-1 flex size-12 items-center justify-center rounded-card border border-border bg-surface shadow-card [&_svg]:size-5 [&_svg]:text-sky-700">
          <span aria-hidden className="absolute -inset-3 -z-10 rounded-[20px] bg-sky-50/70" />
          {icon}
        </div>
      ) : null}
      <p className="text-title font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-sm text-body text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
