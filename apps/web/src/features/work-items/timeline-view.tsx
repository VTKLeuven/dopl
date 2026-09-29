"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format, parseISO } from "date-fns";
import { CalendarPlus, Crosshair } from "lucide-react";
import type { DisplayOptions } from "@dopl/shared/schemas/view";
import {
  addDays,
  addMonths,
  diffDays,
  startOfMonth,
  startOfWeek,
  todayIn,
} from "@dopl/shared/domain/dates";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { StateIcon } from "@/components/icons/state-icon";
import type { BlockingRelation } from "./data";
import type { ProjectMeta, WorkItemRow } from "./types";

type Zoom = "week" | "month" | "quarter";
const DAY_WIDTH: Record<Zoom, number> = { week: 44, month: 18, quarter: 6 };
const ROW_H = 36;
const HEADER_H = 52;
const LEFT_W = 320;

type DragMode = "move" | "start" | "end";
interface DragState {
  id: string;
  mode: DragMode;
  originX: number;
  delta: number;
}

export interface TimelineViewProps {
  rows: WorkItemRow[];
  meta: ProjectMeta;
  options: DisplayOptions;
  setOptions: (patch: Partial<DisplayOptions>) => void;
  relations: BlockingRelation[];
  focusedId: string | null;
  onFocus: (id: string) => void;
  onOpen: (row: WorkItemRow) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}

/** The dates a bar spans; items with one date get a one-day bar. */
function span(row: WorkItemRow): [string, string] | null {
  const s = row.startDate ?? row.dueDate;
  const e = row.dueDate ?? row.startDate;
  return s && e ? [s, e] : null;
}

function applyDrag(range: [string, string], drag: DragState | null, id: string): [string, string] {
  if (!drag || drag.id !== id || drag.delta === 0) return range;
  const [s, e] = range;
  if (drag.mode === "move") return [addDays(s, drag.delta), addDays(e, drag.delta)];
  if (drag.mode === "start") {
    const next = addDays(s, drag.delta);
    return [next > e ? e : next, e];
  }
  const next = addDays(e, drag.delta);
  return [s, next < s ? s : next];
}

export function TimelineView(props: TimelineViewProps) {
  const { rows, meta, options, setOptions, relations, onOpen, onUpdate } = props;
  const t = useTranslations("timeline");
  const zoom: Zoom = options.timeline?.zoom ?? "month";
  const dayW = DAY_WIDTH[zoom];
  const [today] = useState(() => todayIn(meta.calendar.timeZone));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const canEdit = meta.can.edit;

  // Visible range: every dated item plus a margin, and always today.
  const [rangeStart, rangeEnd] = useMemo(() => {
    let min = today;
    let max = today;
    for (const r of rows) {
      const sp = span(r);
      if (!sp) continue;
      if (sp[0] < min) min = sp[0];
      if (sp[1] > max) max = sp[1];
    }
    const pad = zoom === "quarter" ? 3 : zoom === "month" ? 2 : 1;
    return [
      startOfWeek(startOfMonth(addMonths(min, -pad)), meta.calendar.weekStartsOn),
      addMonths(startOfMonth(max), pad + 1),
    ];
  }, [rows, today, zoom, meta.calendar.weekStartsOn]);
  const totalDays = diffDays(rangeEnd, rangeStart) + 1;
  const trackW = totalDays * dayW;
  const x = useCallback((date: string) => diffDays(date, rangeStart) * dayW, [rangeStart, dayW]);

  const indexOf = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
    getItemKey: (i) => rows[i]?.id ?? i,
    scrollMargin: 0,
    paddingStart: 0,
  });

  const scrollToDate = useCallback(
    (date: string, smooth = true) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({
        left: Math.max(0, x(date) - (el.clientWidth - LEFT_W) / 3),
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [x],
  );
  // Start centred on today; re-centre when the zoom changes.
  useEffect(() => scrollToDate(today, false), [today, zoom, scrollToDate]);

  /* ── dragging bars (pointer) ── */
  const dragRef = useRef<DragState | null>(null);
  const startDrag = useCallback(
    (e: React.PointerEvent, row: WorkItemRow, mode: DragMode) => {
      if (!canEdit || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const state: DragState = { id: row.id, mode, originX: e.clientX, delta: 0 };
      dragRef.current = state;
      setDrag(state);
      const onMove = (ev: PointerEvent) => {
        const cur = dragRef.current;
        if (!cur) return;
        const delta = Math.round((ev.clientX - cur.originX) / dayW);
        if (delta !== cur.delta) {
          dragRef.current = { ...cur, delta };
          setDrag(dragRef.current);
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const cur = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        if (!cur || cur.delta === 0) {
          if (cur && cur.mode === "move") onOpen(row);
          return;
        }
        const sp = span(row);
        if (!sp) return;
        const [s, en] = applyDrag(sp, cur, row.id);
        // One update with both dates, so start and due move atomically.
        onUpdate(row.id, { startDate: s, dueDate: en });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [canEdit, dayW, onOpen, onUpdate],
  );

  const onKeyMove = useCallback(
    (row: WorkItemRow, delta: number, resize: boolean) => {
      const sp = span(row);
      if (!sp || !canEdit) return;
      const [s, en] = resize
        ? [sp[0], addDays(sp[1], delta) < sp[0] ? sp[0] : addDays(sp[1], delta)]
        : [addDays(sp[0], delta), addDays(sp[1], delta)];
      onUpdate(row.id, { startDate: s, dueDate: en });
    },
    [canEdit, onUpdate],
  );

  /** Clicking an empty track schedules an undated item on that day. */
  const scheduleAt = useCallback(
    (row: WorkItemRow, clientX: number, trackLeft: number) => {
      if (!canEdit) return;
      const day = addDays(rangeStart, Math.floor((clientX - trackLeft) / dayW));
      onUpdate(row.id, { startDate: day, dueDate: day });
    },
    [canEdit, dayW, onUpdate, rangeStart],
  );

  /* ── dependency arrows ── */
  const arrows = useMemo(() => {
    const out: Array<{ id: string; d: string; conflict: boolean }> = [];
    for (const rel of relations) {
      const si = indexOf.get(rel.sourceId);
      const ti = indexOf.get(rel.targetId);
      if (si === undefined || ti === undefined) continue;
      const src = rows[si];
      const tgt = rows[ti];
      const ss = src && span(src);
      const ts = tgt && span(tgt);
      if (!ss || !ts) continue;
      const [, sEnd] = applyDrag(ss, drag, rel.sourceId);
      const [tStart] = applyDrag(ts, drag, rel.targetId);
      const x1 = x(sEnd) + dayW;
      const y1 = si * ROW_H + ROW_H / 2;
      const x2 = x(tStart);
      const y2 = ti * ROW_H + ROW_H / 2;
      const bend = 10;
      const d =
        x2 - bend >= x1 + bend
          ? `M${x1},${y1} H${x1 + bend} V${y2} H${x2 - 2}`
          : `M${x1},${y1} H${x1 + bend} V${y1 + (y2 > y1 ? ROW_H / 2 : -ROW_H / 2)} H${x2 - bend} V${y2} H${x2 - 2}`;
      out.push({ id: rel.id, d, conflict: sEnd >= tStart });
    }
    return out;
  }, [relations, indexOf, rows, drag, x, dayW]);

  /* ── header ticks ── */
  const header = useMemo(() => {
    const months: Array<{ label: string; left: number; width: number }> = [];
    for (let m = startOfMonth(rangeStart); m <= rangeEnd; m = addMonths(m, 1)) {
      const from = m < rangeStart ? rangeStart : m;
      const to = addDays(addMonths(m, 1), -1);
      const end = to > rangeEnd ? rangeEnd : to;
      months.push({
        label: format(parseISO(m), zoom === "quarter" ? "MMM yy" : "MMMM yyyy"),
        left: x(from),
        width: (diffDays(end, from) + 1) * dayW,
      });
    }
    const ticks: Array<{ label: string; left: number; weekend?: boolean }> = [];
    if (zoom === "week") {
      for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1)) {
        const wd = parseISO(d).getDay();
        ticks.push({
          label: format(parseISO(d), "EEEEE d"),
          left: x(d),
          weekend: wd === 0 || wd === 6,
        });
      }
    } else if (zoom === "month") {
      for (
        let d = startOfWeek(rangeStart, meta.calendar.weekStartsOn);
        d <= rangeEnd;
        d = addDays(d, 7)
      )
        if (d >= rangeStart) ticks.push({ label: format(parseISO(d), "d"), left: x(d) });
    }
    return { months, ticks };
  }, [rangeStart, rangeEnd, zoom, x, dayW, meta.calendar.weekStartsOn]);

  const scheduled = rows.filter((r) => span(r)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="timeline">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 md:px-5">
        <Button size="xs" onClick={() => scrollToDate(today)}>
          <Crosshair />
          {t("today")}
        </Button>
        <span className="text-small text-fg-muted">
          {t("scheduled", { count: scheduled, total: rows.length })}
        </span>
        <div className="ml-auto">
          <SegmentedControl
            value={zoom}
            onValueChange={(v) => setOptions({ timeline: { zoom: v as Zoom } })}
            label={t("zoom")}
          >
            <SegmentedControlItem value="week">{t("week")}</SegmentedControlItem>
            <SegmentedControlItem value="month">{t("month")}</SegmentedControlItem>
            <SegmentedControlItem value="quarter">{t("quarter")}</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </div>
      <div
        ref={scrollRef}
        className={cn(
          "relative min-h-0 flex-1 scrollbar-thin overflow-auto",
          drag && "cursor-grabbing select-none",
        )}
      >
        <div
          style={{ width: LEFT_W + trackW, height: HEADER_H + rows.length * ROW_H }}
          className="relative"
        >
          {/* header */}
          <div
            className="sticky top-0 z-[4] flex border-b border-border bg-surface-muted"
            style={{ height: HEADER_H, width: LEFT_W + trackW }}
          >
            <div
              className="sticky left-0 z-[5] flex shrink-0 items-end border-r border-border bg-surface-muted px-3 pb-1.5 text-small font-medium text-fg-secondary"
              style={{ width: LEFT_W }}
            >
              {t("item")}
            </div>
            <div className="relative" style={{ width: trackW }}>
              {header.months.map((m) => (
                <div
                  key={m.left}
                  className="absolute top-0 h-6 border-l border-border text-small font-medium text-fg-secondary"
                  style={{ left: m.left, width: m.width }}
                >
                  {/* Sticky so the month stays readable while scrolling through it. */}
                  <span className="sticky inline-block truncate px-2 pt-1" style={{ left: LEFT_W }}>
                    {m.label}
                  </span>
                </div>
              ))}
              {header.ticks.map((tk) => (
                <div
                  key={tk.left}
                  className={cn(
                    "absolute top-6 h-[26px] border-l border-border/70 pt-1 text-center text-caption tabular",
                    tk.weekend ? "text-fg-placeholder" : "text-fg-muted",
                  )}
                  style={{ left: tk.left, width: zoom === "week" ? dayW : 7 * dayW }}
                >
                  {tk.label}
                </div>
              ))}
            </div>
          </div>

          {/* grid background: weekends (week zoom) and today line */}
          <div
            className="pointer-events-none absolute"
            style={{ left: LEFT_W, top: HEADER_H, width: trackW, height: rows.length * ROW_H }}
          >
            {zoom === "week"
              ? header.ticks
                  .filter((tk) => tk.weekend)
                  .map((tk) => (
                    <div
                      key={tk.left}
                      className="absolute inset-y-0 bg-surface-muted"
                      style={{ left: tk.left, width: dayW }}
                    />
                  ))
              : null}
            <div
              className="absolute inset-y-0 w-0.5 bg-sky-500/70"
              style={{ left: x(today) + dayW / 2 - 1 }}
              data-testid="today-line"
            />
            <svg
              className="absolute inset-0 overflow-visible"
              width={trackW}
              height={rows.length * ROW_H}
              aria-hidden
            >
              <defs>
                <marker
                  id="tl-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" className="fill-fg-muted" />
                </marker>
                <marker
                  id="tl-arrow-bad"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" className="fill-danger" />
                </marker>
              </defs>
              {arrows.map((a) => (
                <path
                  key={a.id}
                  d={a.d}
                  data-testid="dependency"
                  data-conflict={a.conflict || undefined}
                  className={cn(
                    "fill-none stroke-[1.5]",
                    a.conflict ? "stroke-danger" : "stroke-fg-muted/70",
                  )}
                  markerEnd={a.conflict ? "url(#tl-arrow-bad)" : "url(#tl-arrow)"}
                />
              ))}
            </svg>
          </div>

          {/* rows */}
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            if (!row) return null;
            return (
              <TimelineRow
                key={vi.key}
                row={row}
                top={HEADER_H + vi.start}
                meta={meta}
                trackW={trackW}
                range={span(row)}
                preview={drag?.id === row.id ? drag : null}
                x={x}
                dayW={dayW}
                focused={props.focusedId === row.id}
                canEdit={canEdit}
                onFocus={props.onFocus}
                onOpen={onOpen}
                onStartDrag={startDrag}
                onKeyMove={onKeyMove}
                onSchedule={scheduleAt}
                t={t}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const TimelineRow = memo(function TimelineRow({
  row,
  top,
  meta,
  trackW,
  range,
  preview,
  x,
  dayW,
  focused,
  canEdit,
  onFocus,
  onOpen,
  onStartDrag,
  onKeyMove,
  onSchedule,
  t,
}: {
  row: WorkItemRow;
  top: number;
  meta: ProjectMeta;
  trackW: number;
  range: [string, string] | null;
  preview: DragState | null;
  x: (date: string) => number;
  dayW: number;
  focused: boolean;
  canEdit: boolean;
  onFocus: (id: string) => void;
  onOpen: (row: WorkItemRow) => void;
  onStartDrag: (e: React.PointerEvent, row: WorkItemRow, mode: DragMode) => void;
  onKeyMove: (row: WorkItemRow, delta: number, resize: boolean) => void;
  onSchedule: (row: WorkItemRow, clientX: number, trackLeft: number) => void;
  t: ReturnType<typeof useTranslations<"timeline">>;
}) {
  const state = meta.states.find((s) => s.id === row.stateId);
  const shown = range ? applyDrag(range, preview, row.id) : null;
  const left = shown ? x(shown[0]) : 0;
  const width = shown ? (diffDays(shown[1], shown[0]) + 1) * dayW : 0;
  const color = state?.color ?? "#71717A";
  const done = row.stateGroup === "COMPLETED" || row.stateGroup === "CANCELLED";
  const labelInside = width > 120;

  return (
    <div
      className={cn(
        "group/tl absolute left-0 flex border-b border-border/60",
        focused ? "bg-surface-hover" : "hover:bg-surface-hover/60",
      )}
      style={{ top, height: ROW_H, width: LEFT_W + trackW }}
      data-testid="timeline-row"
      data-id={row.identifier}
      onMouseEnter={() => onFocus(row.id)}
    >
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="sticky left-0 z-[3] flex shrink-0 items-center gap-2 border-r border-border bg-surface px-3 text-left focus-ring group-hover/tl:bg-surface-hover"
        style={{ width: LEFT_W }}
      >
        {state ? <StateIcon group={state.group} color={state.color} /> : null}
        <span className="w-16 shrink-0 truncate text-small font-medium text-fg-muted tabular">
          {row.identifier}
        </span>
        <span className={cn("truncate text-body text-fg", done && "text-fg-muted")}>
          {row.title}
        </span>
      </button>
      <div
        className="relative"
        style={{ width: trackW }}
        onClick={(e) => {
          if (range || !canEdit) return;
          onSchedule(row, e.clientX, e.currentTarget.getBoundingClientRect().left);
        }}
      >
        {shown ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={`${row.identifier}: ${shown[0]} – ${shown[1]}`}
            data-testid="timeline-bar"
            onPointerDown={(e) => onStartDrag(e, row, "move")}
            onKeyDown={(e) => {
              if (e.key === "Enter") return onOpen(row);
              if (!e.shiftKey) return;
              const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
              if (!delta) return;
              e.preventDefault();
              onKeyMove(row, delta, e.altKey);
            }}
            className={cn(
              "absolute top-1.5 flex h-6 items-center rounded-[7px] border text-small font-medium focus-ring",
              canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
              preview && "shadow-popover",
            )}
            style={{
              left,
              width: Math.max(width, 6),
              backgroundColor: `color-mix(in oklch, ${color} ${done ? 12 : 22}%, var(--color-surface))`,
              borderColor: `color-mix(in oklch, ${color} 55%, var(--color-surface))`,
            }}
          >
            {canEdit ? (
              <span
                onPointerDown={(e) => onStartDrag(e, row, "start")}
                className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-[7px] hover:bg-black/10"
              />
            ) : null}
            {labelInside ? <span className="truncate px-2.5 text-fg">{row.title}</span> : null}
            {canEdit ? (
              <span
                onPointerDown={(e) => onStartDrag(e, row, "end")}
                className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-[7px] hover:bg-black/10"
              />
            ) : null}
          </div>
        ) : canEdit ? (
          <span
            className="pointer-events-none sticky hidden h-full items-center gap-1 text-small text-fg-placeholder group-hover/tl:inline-flex"
            style={{ left: LEFT_W + 12 }}
          >
            <CalendarPlus className="size-3.5" />
            {t("clickToSchedule")}
          </span>
        ) : null}
        {shown && !labelInside ? (
          <span
            className="pointer-events-none absolute top-0 flex h-full items-center truncate pl-2 text-small text-fg-secondary"
            style={{ left: left + Math.max(width, 6), maxWidth: 360 }}
          >
            {row.title}
          </span>
        ) : null}
      </div>
    </div>
  );
});
