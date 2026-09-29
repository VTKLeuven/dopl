import { cn } from "@/lib/cn";

/** Sub-item progress ring (sky-600 on neutral-200). */
export function ProgressRing({
  value,
  total,
  size = 14,
  className,
  label,
}: {
  value: number;
  total: number;
  size?: number;
  className?: string;
  label?: string;
}) {
  const r = 5.5;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={cn("-rotate-90", className)}
      role="img"
      aria-label={label ?? `${value}/${total}`}
    >
      <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-neutral-200" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className={pct >= 1 ? "stroke-success" : "stroke-sky-600"}
      />
    </svg>
  );
}
