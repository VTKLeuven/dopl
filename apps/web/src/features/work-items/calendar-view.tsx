"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { CalendarX2, ChevronLeft, ChevronRight, PanelRight } from "lucide-react";
import type { DisplayOptions } from "@dopl/shared/schemas/view";
import {
  addDays,
  addMonths,
  eachDay,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  todayIn,
} from "@dopl/shared/domain/dates";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StateIcon } from "@/components/icons/state-icon";
import { PriorityIcon } from "@/components/icons/priority-icon";
import { sortRows } from "./grouping";
import type { ProjectMeta, WorkItemRow } from "./types";

type Mode = "month" | "week";
type DateField = "dueDate" | "startDate";
const MONTH_VISIBLE = 3;

export interface CalendarViewProps {
  rows: WorkItemRow[];
  meta: ProjectMeta;
  options: DisplayOptions;
  setOptions: (patch: Partial<DisplayOptions>) => void;
  focusedId: string | null;
  onFocus: (id: string) => void;
  onOpen: (row: WorkItemRow) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}

export function CalendarView(props: CalendarViewProps) {
  const { rows, meta, options, setOptions, onOpen, onUpdate } = props;
  const t = useTranslations("calendar");
  const mode: Mode = options.calendar?.mode ?? "month";
  const field: DateField = options.calendar?.dateField ?? "dueDate";
  const weekStartsOn = meta.calendar.weekStartsOn;
  const [today] = useState(() => todayIn(meta.calendar.timeZone));
  const [anchor, setAnchor] = useState(today);
  const [trayOpen, setTrayOpen] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const canEdit = meta.can.edit;

  const days = useMemo(() => {
    const from =
      mode === "month"
        ? startOfWeek(startOfMonth(anchor), weekStartsOn)
        : startOfWeek(anchor, weekStartsOn);
    const to =
      mode === "month"
        ? endOfWeek(endOfMonth(anchor), weekStartsOn)
        : endOfWeek(anchor, weekStartsOn);
    return eachDay(from, to);
  }, [anchor, mode, weekStartsOn]);

  const { byDay, unscheduled } = useMemo(() => {
    const sorted = sortRows(rows, { field: "priority", dir: "asc" });
    const map = new Map<string, WorkItemRow[]>();
    const none: WorkItemRow[] = [];
    for (const r of sorted) {
      const d = r[field];
      if (!d) none.push(r);
      else map.set(d, [...(map.get(d) ?? []), r]);
    }
    return { byDay: map, unscheduled: none };
  }, [rows, field]);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const activeRow = activeId ? rowById.get(activeId) : undefined;

  const setCalendar = (patch: Partial<{ mode: Mode; dateField: DateField }>) =>
    setOptions({ calendar: { mode, dateField: field, ...patch } });

  const step = (dir: 1 | -1) =>
    setAnchor((a) => (mode === "month" ? addMonths(startOfMonth(a), dir) : addDays(a, 7 * dir)));

  /* ── moving items (drag or keyboard) ── */
  const pendingFocus = useRef<string | null>(null);
  const move = useCallback(
    (row: WorkItemRow, date: string | null, keepFocus = false) => {
      if (row[field] === date) return;
      if (keepFocus) pendingFocus.current = row.id;
      onUpdate(row.id, { [field]: date });
    },
    [field, onUpdate],
  );
  const claimFocus = useCallback((id: string) => {
    if (pendingFocus.current !== id) return false;
    pendingFocus.current = null;
    return true;
  }, []);
  const onKeyMove = useCallback(
    (row: WorkItemRow, delta: number) => {
      const from = row[field];
      if (!from) return;
      const next = addDays(from, delta);
      move(row, next, true);
      if (!days.includes(next)) setAnchor(next);
    },
    [days, field, move],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const row = rowById.get(String(e.active.id));
    const over = e.over ? String(e.over.id) : null;
    if (!row || !over) return;
    if (over === "tray") move(row, null);
    else if (over.startsWith("day:")) move(row, over.slice(4));
  };

  const title =
    mode === "month"
      ? format(parseISO(startOfMonth(anchor)), "MMMM yyyy")
      : `${format(parseISO(days[0] ?? anchor), "d MMM")} – ${format(parseISO(days.at(-1) ?? anchor), "d MMM yyyy")}`;
  const weeks = Math.ceil(days.length / 7);

  return (
    <DndContext
      id="calendar"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex min-h-0 flex-1 flex-col" data-testid="calendar">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 md:px-5">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("previous")}
              onClick={() => step(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("next")} onClick={() => step(1)}>
              <ChevronRight />
            </Button>
          </div>
          <Button size="xs" onClick={() => setAnchor(today)}>
            {t("today")}
          </Button>
          <h2 className="ml-1 text-title font-semibold text-fg" data-testid="calendar-title">
            {title}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <SegmentedControl
              value={field}
              onValueChange={(v) => setCalendar({ dateField: v as DateField })}
              label={t("dateField")}
            >
              <SegmentedControlItem value="dueDate">{t("due")}</SegmentedControlItem>
              <SegmentedControlItem value="startDate">{t("start")}</SegmentedControlItem>
            </SegmentedControl>
            <SegmentedControl
              value={mode}
              onValueChange={(v) => setCalendar({ mode: v as Mode })}
              label={t("mode")}
            >
              <SegmentedControlItem value="month">{t("month")}</SegmentedControlItem>
              <SegmentedControlItem value="week">{t("week")}</SegmentedControlItem>
            </SegmentedControl>
            <Tooltip content={t("unscheduled")}>
              <Button
                size="sm"
                variant={trayOpen ? "secondary" : "ghost"}
                onClick={() => setTrayOpen((o) => !o)}
                aria-pressed={trayOpen}
                className="hidden md:inline-flex"
              >
                <PanelRight />
                <span className="tabular">{unscheduled.length}</span>
              </Button>
            </Tooltip>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="grid shrink-0 grid-cols-7 border-b border-border bg-surface-muted">
              {days.slice(0, 7).map((d) => (
                <div
                  key={d}
                  className={cn(
                    "px-2 py-1.5 text-caption font-medium tracking-wide uppercase",
                    mode === "week" && d === today ? "text-sky-700" : "text-fg-muted",
                  )}
                >
                  {format(parseISO(d), mode === "week" ? "EEE d" : "EEE")}
                </div>
              ))}
            </div>
            <div
              className={cn(
                "grid min-h-0 flex-1 grid-cols-7",
                mode === "month" ? "auto-rows-fr" : "grid-rows-1",
              )}
              style={
                mode === "month"
                  ? { gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }
                  : undefined
              }
            >
              {days.map((d) => (
                <DayCell
                  key={d}
                  date={d}
                  mode={mode}
                  today={d === today}
                  outside={mode === "month" && d.slice(0, 7) !== startOfMonth(anchor).slice(0, 7)}
                  rows={byDay.get(d) ?? []}
                  meta={meta}
                  canEdit={canEdit}
                  activeId={activeId}
                  focusedId={props.focusedId}
                  onFocus={props.onFocus}
                  onOpen={onOpen}
                  onKeyMove={onKeyMove}
                  claimFocus={claimFocus}
                />
              ))}
            </div>
          </div>
          {trayOpen ? (
            <Tray
              rows={unscheduled}
              meta={meta}
              canEdit={canEdit}
              activeId={activeId}
              onOpen={onOpen}
              onFocus={props.onFocus}
              focusedId={props.focusedId}
            />
          ) : null}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 140, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeRow ? <ChipBody row={activeRow} meta={meta} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ───────────────────────── day cells ───────────────────────── */

function DayCell({
  date,
  mode,
  today,
  outside,
  rows,
  meta,
  canEdit,
  activeId,
  focusedId,
  onFocus,
  onOpen,
  onKeyMove,
  claimFocus,
}: {
  date: string;
  mode: Mode;
  today: boolean;
  outside: boolean;
  rows: WorkItemRow[];
  meta: ProjectMeta;
  canEdit: boolean;
  activeId: string | null;
  focusedId: string | null;
  onFocus: (id: string) => void;
  onOpen: (row: WorkItemRow) => void;
  onKeyMove: (row: WorkItemRow, delta: number) => void;
  claimFocus: (id: string) => boolean;
}) {
  const t = useTranslations("calendar");
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, disabled: !canEdit });
  const visible = mode === "month" ? rows.slice(0, MONTH_VISIBLE) : rows;
  const hidden = rows.length - visible.length;
  const chip = (r: WorkItemRow) => (
    <Chip
      key={r.id}
      row={r}
      meta={meta}
      canEdit={canEdit}
      showId={mode === "week"}
      tall={mode === "week"}
      dragging={activeId === r.id}
      focused={focusedId === r.id}
      onFocus={onFocus}
      onOpen={onOpen}
      onKeyMove={onKeyMove}
      claimFocus={claimFocus}
    />
  );
  return (
    <div
      ref={setNodeRef}
      data-date={date}
      data-testid="calendar-day"
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-1 border-r border-b border-border p-1.5 [&:nth-child(7n)]:border-r-0",
        outside && "bg-surface-muted/60",
        isOver && "bg-sky-50 ring-1 ring-sky-300 ring-inset",
      )}
    >
      <div className={cn("flex items-center justify-between px-0.5", mode === "week" && "hidden")}>
        <span
          className={cn(
            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-small tabular",
            today
              ? "bg-primary font-semibold text-on-primary"
              : outside
                ? "text-fg-placeholder"
                : "text-fg-secondary",
          )}
        >
          {date.endsWith("-01") && mode === "month"
            ? format(parseISO(date), "d MMM")
            : Number(date.slice(8))}
        </span>
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-col gap-1",
          mode === "week" && "scrollbar-thin overflow-y-auto",
        )}
      >
        {visible.map(chip)}
        {hidden > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-6 rounded-[6px] px-1.5 text-left text-small font-medium text-fg-muted focus-ring hover:bg-neutral-150 hover:text-fg"
              >
                {t("more", { count: hidden })}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2">
              <p className="mb-1.5 px-1 text-small font-medium text-fg-secondary">
                {format(parseISO(date), "EEEE d MMMM")}
              </p>
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">{rows.map(chip)}</div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

function Tray({
  rows,
  meta,
  canEdit,
  activeId,
  focusedId,
  onFocus,
  onOpen,
}: {
  rows: WorkItemRow[];
  meta: ProjectMeta;
  canEdit: boolean;
  activeId: string | null;
  focusedId: string | null;
  onFocus: (id: string) => void;
  onOpen: (row: WorkItemRow) => void;
}) {
  const t = useTranslations("calendar");
  const { setNodeRef, isOver } = useDroppable({ id: "tray", disabled: !canEdit });
  return (
    <aside
      ref={setNodeRef}
      data-testid="calendar-tray"
      className={cn(
        "hidden w-72 shrink-0 flex-col border-l border-border md:flex",
        isOver && "bg-sky-50",
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-small font-medium text-fg-secondary">{t("unscheduled")}</span>
        <span className="text-small text-fg-muted tabular">{rows.length}</span>
      </div>
      <div className="flex min-h-0 flex-1 scrollbar-thin flex-col gap-1 overflow-y-auto p-2">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-small text-fg-muted">
            <CalendarX2 className="size-5 text-icon" />
            {t("allScheduled")}
          </div>
        ) : (
          rows.map((r) => (
            <Chip
              key={r.id}
              row={r}
              meta={meta}
              canEdit={canEdit}
              dragging={activeId === r.id}
              focused={focusedId === r.id}
              onFocus={onFocus}
              onOpen={onOpen}
              showId
            />
          ))
        )}
      </div>
    </aside>
  );
}

/* ───────────────────────── chips ───────────────────────── */

const Chip = memo(function Chip({
  row,
  meta,
  canEdit,
  dragging,
  focused,
  onFocus,
  onOpen,
  onKeyMove,
  claimFocus,
  showId = false,
  tall = false,
}: {
  row: WorkItemRow;
  meta: ProjectMeta;
  canEdit: boolean;
  tall?: boolean;
  dragging: boolean;
  focused: boolean;
  onFocus: (id: string) => void;
  onOpen: (row: WorkItemRow) => void;
  onKeyMove?: (row: WorkItemRow, delta: number) => void;
  claimFocus?: (id: string) => boolean;
  showId?: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: row.id, disabled: !canEdit });
  const ref = useRef<HTMLButtonElement | null>(null);
  // After a keyboard move the chip remounts in another cell; take focus back.
  useEffect(() => {
    if (claimFocus?.(row.id)) ref.current?.focus();
  }, [claimFocus, row.id]);
  return (
    <button
      type="button"
      ref={(el) => {
        ref.current = el;
        setNodeRef(el);
      }}
      {...attributes}
      {...listeners}
      data-testid="calendar-chip"
      data-id={row.identifier}
      onClick={() => onOpen(row)}
      onFocus={() => onFocus(row.id)}
      onKeyDown={(e) => {
        if (!onKeyMove || !canEdit || !(e.altKey || e.shiftKey)) return;
        const delta =
          e.key === "ArrowLeft"
            ? -1
            : e.key === "ArrowRight"
              ? 1
              : e.key === "ArrowUp"
                ? -7
                : e.key === "ArrowDown"
                  ? 7
                  : 0;
        if (!delta) return;
        e.preventDefault();
        e.stopPropagation();
        onKeyMove(row, delta);
      }}
      className={cn(
        "w-full rounded-[7px] text-left focus-ring",
        dragging && "opacity-40",
        focused && "ring-1 ring-sky-400",
      )}
    >
      <ChipBody row={row} meta={meta} showId={showId} tall={tall} />
    </button>
  );
});

function ChipBody({
  row,
  meta,
  overlay = false,
  showId = false,
  tall = false,
}: {
  row: WorkItemRow;
  meta: ProjectMeta;
  overlay?: boolean;
  showId?: boolean;
  tall?: boolean;
}) {
  const state = meta.states.find((s) => s.id === row.stateId);
  const done = row.stateGroup === "COMPLETED" || row.stateGroup === "CANCELLED";
  const icons = (
    <>
      {state ? <StateIcon group={state.group} color={state.color} /> : null}
      {row.priority === "URGENT" || row.priority === "HIGH" ? (
        <PriorityIcon priority={row.priority} />
      ) : null}
      {showId ? <span className="shrink-0 text-fg-muted tabular">{row.identifier}</span> : null}
    </>
  );
  const title = (
    <span
      className={cn(
        "font-medium text-fg",
        tall ? "line-clamp-2" : "truncate",
        done && "text-fg-muted line-through",
      )}
    >
      {row.title}
    </span>
  );
  return (
    <span
      className={cn(
        "flex min-w-0 rounded-[7px] border border-border bg-surface px-1.5 text-small shadow-xs",
        "hover:border-border-strong",
        tall ? "flex-col gap-0.5 py-1" : "h-7 items-center gap-1.5",
        overlay && "w-56 rotate-1 shadow-popover",
      )}
    >
      {tall ? (
        <>
          <span className="flex items-center gap-1.5">{icons}</span>
          {title}
        </>
      ) : (
        <>
          {icons}
          {title}
        </>
      )}
    </span>
  );
}
