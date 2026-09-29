import { cn } from "@/lib/cn";

export type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

/** Ascending bars; only Urgent is coloured (DESIGN_SYSTEM §3.6). */
export function PriorityIcon({
  priority,
  size = 16,
  className,
  label,
}: {
  priority: Priority;
  size?: number;
  className?: string;
  label?: string;
}) {
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };
  if (priority === "URGENT") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className={cn("shrink-0", className)}
        {...a11y}
      >
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="var(--color-danger)" />
        <path d="M8 4.6v4.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r="1.05" fill="white" />
      </svg>
    );
  }
  if (priority === "NONE") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className={cn("shrink-0", className)}
        {...a11y}
      >
        {[2.5, 6.75, 11].map((x) => (
          <rect
            key={x}
            x={x}
            y="7.25"
            width="2.5"
            height="1.5"
            rx="0.75"
            fill="var(--color-neutral-400)"
          />
        ))}
      </svg>
    );
  }
  const filled = priority === "HIGH" ? 3 : priority === "MEDIUM" ? 2 : 1;
  const bars = [
    { x: 2.5, h: 5 },
    { x: 6.75, h: 8 },
    { x: 11, h: 11 },
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn("shrink-0", className)}
      {...a11y}
    >
      {bars.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={13.5 - b.h}
          width="2.5"
          height={b.h}
          rx="1"
          fill={i < filled ? "var(--color-neutral-800)" : "var(--color-neutral-300)"}
        />
      ))}
    </svg>
  );
}
