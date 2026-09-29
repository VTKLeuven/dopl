"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export const toISODate = (d: Date) => format(d, "yyyy-MM-dd");
export const fromISODate = (s: string) => parseISO(s);

/**
 * Month grid on date-fns (D-044). Values are YYYY-MM-DD strings (no time zone).
 * Weeks start on Monday (Q-14 default).
 */
export function Calendar({
  value,
  onChange,
  weekStartsOn = 1,
  labels,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  weekStartsOn?: 0 | 1;
  labels: { prev: string; next: string; today: string; tomorrow: string; nextWeek: string; clear: string };
}) {
  const selected = value ? fromISODate(value) : null;
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()));
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn }),
      }),
    [month, weekStartsOn],
  );
  const weekdays = days.slice(0, 7).map((d) => format(d, "EEEEEE"));
  const today = new Date();

  return (
    <div className="w-[264px] p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {[
          { label: labels.today, date: today },
          { label: labels.tomorrow, date: addDays(today, 1) },
          { label: labels.nextWeek, date: addDays(startOfWeek(addDays(today, 7), { weekStartsOn }), 0) },
        ].map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onChange(toISODate(q.date))}
            className="h-7 rounded-chip border border-border px-2 text-small text-fg-secondary hover:bg-surface-hover focus-ring"
          >
            {q.label}
          </button>
        ))}
        {value ? (
          <button type="button" onClick={() => onChange(null)} className="h-7 rounded-chip px-2 text-small text-danger-text hover:bg-danger-bg focus-ring">
            {labels.clear}
          </button>
        ) : null}
      </div>
      <div className="mb-1 flex items-center justify-between">
        <span className="pl-1 text-body font-medium">{format(month, "MMMM yyyy")}</span>
        <div className="flex">
          <Button variant="ghost" size="icon-xs" aria-label={labels.prev} onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={labels.next} onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center" role="grid">
        {weekdays.map((w) => (
          <span key={w} className="py-1 text-caption font-medium text-fg-muted">{w}</span>
        ))}
        {days.map((d) => {
          const isSel = selected ? isSameDay(d, selected) : false;
          return (
            <button
              key={d.toISOString()}
              type="button"
              role="gridcell"
              aria-selected={isSel}
              onClick={() => onChange(toISODate(d))}
              className={cn(
                "tabular mx-auto flex size-8 items-center justify-center rounded-[8px] text-small focus-ring",
                !isSameMonth(d, month) && "text-fg-disabled",
                isToday(d) && !isSel && "font-semibold text-sky-700",
                isSel ? "bg-sky-600 font-medium text-white" : "hover:bg-neutral-150",
              )}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
