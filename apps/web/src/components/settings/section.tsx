import { cn } from "@/lib/cn";

/** Settings page section: title + hint on the left, controls on the right. */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-4 border-b border-border px-5 py-6 md:grid-cols-[240px_1fr] md:gap-8 md:px-8", className)}>
      <div className="flex flex-col gap-1">
        <h2 className="text-body font-semibold text-fg">{title}</h2>
        {description ? <p className="text-small text-fg-muted">{description}</p> : null}
      </div>
      <div className="flex min-w-0 max-w-[640px] flex-col gap-4">{children}</div>
    </section>
  );
}
