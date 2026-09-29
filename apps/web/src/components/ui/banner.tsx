import { Info, ShieldAlert, TriangleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/cn";

const tones = {
  info: { box: "border-info-border bg-info-bg text-info-text", Icon: Info },
  warning: { box: "border-warning-border bg-warning-bg text-warning-text", Icon: TriangleAlert },
  danger: { box: "border-danger-border bg-danger-bg text-danger-text", Icon: ShieldAlert },
  success: { box: "border-success-border bg-success-bg text-success-text", Icon: CircleCheck },
} as const;

export function Banner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof tones;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { box, Icon } = tones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-control border px-3 py-2.5", box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-body">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-fg-secondary">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
