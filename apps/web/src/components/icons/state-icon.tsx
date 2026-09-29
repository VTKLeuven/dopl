import { cn } from "@/lib/cn";

export type StateGroup = "TRIAGE" | "BACKLOG" | "UNSTARTED" | "STARTED" | "COMPLETED" | "CANCELLED";

export const stateGroupColor: Record<StateGroup, string> = {
  TRIAGE: "var(--color-state-triage)",
  BACKLOG: "var(--color-state-backlog)",
  UNSTARTED: "var(--color-state-unstarted)",
  STARTED: "var(--color-state-started)",
  COMPLETED: "var(--color-state-completed)",
  CANCELLED: "var(--color-state-cancelled)",
};

/**
 * Plane-style workflow state icons (DESIGN_SYSTEM §3.5), drawn on a 16×16 grid.
 * `progress` (0–1) sets the pie fill for STARTED.
 */
export function StateIcon({
  group,
  color,
  size = 16,
  progress = 0.5,
  className,
  label,
}: {
  group: StateGroup;
  color?: string | null;
  size?: number;
  progress?: number;
  className?: string;
  label?: string;
}) {
  const c = color ?? stateGroupColor[group];
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    className: cn("shrink-0", className),
    role: label ? "img" : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
  } as const;

  switch (group) {
    case "TRIAGE":
      return (
        <svg {...common} fill="none">
          <circle
            cx="8"
            cy="8"
            r="6.25"
            stroke={c}
            strokeWidth="1.5"
            strokeDasharray="1 2.2"
            strokeLinecap="round"
          />
          <circle cx="8" cy="8" r="2" fill={c} />
        </svg>
      );
    case "BACKLOG":
      return (
        <svg {...common} fill="none">
          <circle cx="8" cy="8" r="6.25" stroke={c} strokeWidth="1.5" strokeDasharray="2.6 2.3" />
        </svg>
      );
    case "UNSTARTED":
      return (
        <svg {...common} fill="none">
          <circle cx="8" cy="8" r="6.25" stroke={c} strokeWidth="1.5" />
        </svg>
      );
    case "STARTED": {
      const p = Math.min(0.999, Math.max(0.12, progress));
      const angle = p * 2 * Math.PI;
      const r = 3.6;
      const x = 8 + r * Math.sin(angle);
      const y = 8 - r * Math.cos(angle);
      const large = p > 0.5 ? 1 : 0;
      return (
        <svg {...common} fill="none">
          <circle cx="8" cy="8" r="6.25" stroke={c} strokeWidth="1.5" />
          <path
            d={`M8 8 L8 ${8 - r} A${r} ${r} 0 ${large} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`}
            fill={c}
          />
        </svg>
      );
    }
    case "COMPLETED":
      return (
        <svg {...common} fill="none">
          <circle cx="8" cy="8" r="7" fill={c} />
          <path
            d="M5.1 8.2 7.1 10.1 10.9 6.1"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "CANCELLED":
      return (
        <svg {...common} fill="none">
          <circle cx="8" cy="8" r="7" fill={c} fillOpacity="0.85" />
          <path
            d="m5.6 5.6 4.8 4.8m0-4.8-4.8 4.8"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
