"use client";

import { useFormatter, useTranslations } from "next-intl";
import { addDays, addHours, nextMonday, set } from "date-fns";
import { AlarmClock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SnoozePreset = "hour" | "evening" | "tomorrow" | "nextWeek";

/** Snooze times in the reader's own time zone. */
export function snoozeTime(preset: SnoozePreset, now = new Date()): Date {
  const at = (d: Date, hours: number) => set(d, { hours, minutes: 0, seconds: 0, milliseconds: 0 });
  switch (preset) {
    case "hour":
      return addHours(now, 1);
    case "evening": {
      const evening = at(now, 18);
      // Late in the day, "this evening" becomes three hours from now.
      return evening.getTime() - now.getTime() > 30 * 60_000 ? evening : addHours(now, 3);
    }
    case "tomorrow":
      return at(addDays(now, 1), 9);
    case "nextWeek":
      return at(nextMonday(now), 9);
  }
}

const PRESETS: SnoozePreset[] = ["hour", "evening", "tomorrow", "nextWeek"];

/** Snooze presets; the trigger is the caller's button (row action, reader, selection bar). */
export function SnoozeMenu({
  onSnooze,
  children,
  open,
  onOpenChange,
  align = "end",
}: {
  onSnooze: (until: Date) => void;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "end";
}) {
  const t = useTranslations("inbox");
  const format = useFormatter();
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64" data-testid="snooze-menu">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <AlarmClock className="size-3.5" />
          {t("snooze")}
        </DropdownMenuLabel>
        {PRESETS.map((p) => {
          const when = snoozeTime(p);
          return (
            <DropdownMenuItem key={p} onSelect={() => onSnooze(snoozeTime(p))}>
              <span className="flex-1">{t(`snoozePresets.${p}`)}</span>
              <span className="text-small text-fg-muted tabular">
                {format.dateTime(when, { weekday: "short", hour: "numeric", minute: "2-digit" })}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
