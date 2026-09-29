import { Bug, Inbox, Siren, Sparkles, SquareCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { tagClass } from "@/lib/palette";

const icons: Record<string, LucideIcon> = {
  "square-check": SquareCheck,
  bug: Bug,
  siren: Siren,
  inbox: Inbox,
  sparkles: Sparkles,
};

export function TypeIcon({
  icon,
  color,
  className,
}: {
  icon: string;
  color: string;
  className?: string;
}) {
  const Icon = icons[icon] ?? SquareCheck;
  return (
    <Icon
      className={cn("size-4 shrink-0", tagClass(color).text, className)}
      strokeWidth={1.75}
      aria-hidden
    />
  );
}
