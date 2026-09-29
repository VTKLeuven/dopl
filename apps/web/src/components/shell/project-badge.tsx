import { cn } from "@/lib/cn";
import { tagClass } from "@/lib/palette";

/** Small rounded square with the project's first letter, tinted by its colour. */
export function ProjectBadge({
  name,
  color,
  size = 18,
  className,
}: {
  name: string;
  color: string | null;
  size?: number;
  className?: string;
}) {
  const c = tagClass(color ?? "blue");
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[5px] border leading-none font-semibold",
        c.pill,
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
