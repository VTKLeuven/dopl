"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnSizingState,
} from "@tanstack/react-table";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { DisplayOptions, OrderField, PropertyKey } from "@dopl/shared/schemas/view";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressRing } from "@/components/ui/progress-ring";
import {
  AssigneePicker,
  DatePicker,
  LabelPicker,
  PriorityPicker,
  StatePicker,
  TypePicker,
} from "./pickers";
import type { ProjectMeta, WorkItemRow } from "./types";

/* ───────────────────────── columns ───────────────────────── */

export type ColumnId =
  | "title"
  | "state"
  | "priority"
  | "assignees"
  | "labels"
  | "type"
  | "startDate"
  | "dueDate"
  | "estimate"
  | "subItems"
  | "createdAt"
  | "updatedAt";

interface ColumnSpec {
  id: ColumnId;
  size: number;
  minSize: number;
  /** The display property that shows or hides it; title is always shown. */
  property: PropertyKey | null;
  sort: OrderField | null;
  editable: boolean;
}

const SPECS: ColumnSpec[] = [
  { id: "title", size: 420, minSize: 220, property: null, sort: "title", editable: true },
  { id: "state", size: 160, minSize: 110, property: "state", sort: null, editable: true },
  {
    id: "priority",
    size: 140,
    minSize: 100,
    property: "priority",
    sort: "priority",
    editable: true,
  },
  { id: "assignees", size: 170, minSize: 100, property: "assignees", sort: null, editable: true },
  { id: "labels", size: 220, minSize: 110, property: "labels", sort: null, editable: true },
  { id: "type", size: 140, minSize: 100, property: "type", sort: null, editable: true },
  {
    id: "startDate",
    size: 130,
    minSize: 110,
    property: "startDate",
    sort: "startDate",
    editable: true,
  },
  { id: "dueDate", size: 130, minSize: 110, property: "dueDate", sort: "dueDate", editable: true },
  { id: "estimate", size: 110, minSize: 80, property: "estimate", sort: null, editable: true },
  { id: "subItems", size: 120, minSize: 90, property: "subItems", sort: null, editable: false },
  {
    id: "createdAt",
    size: 150,
    minSize: 110,
    property: "createdAt",
    sort: "createdAt",
    editable: false,
  },
  {
    id: "updatedAt",
    size: 150,
    minSize: 110,
    property: "updatedAt",
    sort: "updatedAt",
    editable: false,
  },
];
const SPEC = Object.fromEntries(SPECS.map((s) => [s.id, s])) as Record<ColumnId, ColumnSpec>;
const DEFAULT_ORDER = SPECS.map((s) => s.id);

const features = tableFeatures({
  columnSizingFeature,
  columnResizingFeature,
  columnOrderingFeature,
  columnVisibilityFeature,
});
const helper = createColumnHelper<typeof features, WorkItemRow>();
const columnDefs = helper.columns(
  SPECS.map((s) => helper.display({ id: s.id, size: s.size, minSize: s.minSize, maxSize: 900 })),
);
// Rows are rendered from our own sorted list (memoized per row); the table
// instance owns column state only.
const NO_DATA: WorkItemRow[] = [];

/** Column order and widths from display options, with new columns appended. */
function layoutFrom(options: DisplayOptions) {
  const saved = options.table?.columns ?? [];
  const order = [
    "title" as ColumnId,
    ...saved.map((c) => c.id as ColumnId).filter((id) => id !== "title" && SPEC[id]),
  ];
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
  const sizing: ColumnSizingState = {};
  for (const c of saved) if (SPEC[c.id as ColumnId]) sizing[c.id] = c.width;
  return { order, sizing };
}

/* ───────────────────────── view ───────────────────────── */

export type EditTarget = { rowId: string; col: ColumnId } | null;

export interface TableViewProps {
  rows: WorkItemRow[];
  meta: ProjectMeta;
  options: DisplayOptions;
  setOptions: (patch: Partial<DisplayOptions>) => void;
  selection: Set<string>;
  onToggleSelect: (id: string, range?: boolean) => void;
  focusedId: string | null;
  onFocus: (id: string) => void;
  onOpen: (row: WorkItemRow) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onOrderChange: (ids: string[]) => void;
}

export function TableView(props: TableViewProps) {
  const { rows, meta, options, setOptions, onFocus, onOpen, onUpdate, onOrderChange } = props;
  const t = useTranslations("items");
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = options.density === "compact" ? 34 : 40;

  const initial = useMemo(() => layoutFrom(options), [options]);
  const [sizing, setSizing] = useState<ColumnSizingState>(initial.sizing);
  const order = initial.order;
  const visibility = useMemo(
    () =>
      Object.fromEntries(
        SPECS.map((s) => [s.id, s.property === null || options.properties.includes(s.property)]),
      ),
    [options.properties],
  );

  const persistLayout = useCallback(
    (nextOrder: ColumnId[], nextSizing: ColumnSizingState) =>
      setOptions({
        table: {
          columns: nextOrder.map((id) => ({ id, width: nextSizing[id] ?? SPEC[id].size })),
        },
      }),
    [setOptions],
  );

  const table = useTable({
    features,
    columns: columnDefs,
    data: NO_DATA,
    columnResizeMode: "onChange",
    state: { columnSizing: sizing, columnOrder: order, columnVisibility: visibility },
    onColumnSizingChange: (updater) =>
      setSizing((prev) => (typeof updater === "function" ? updater(prev) : updater)),
  });

  // Persist widths once a resize gesture ends.
  const resizing = table.state.columnResizing.isResizingColumn;
  const wasResizing = useRef<string | false>(false);
  useEffect(() => {
    if (wasResizing.current && !resizing) persistLayout(order, sizing);
    wasResizing.current = resizing;
  }, [resizing, order, sizing, persistLayout]);

  const headers = table.getFlatHeaders().filter((h) => h.column.getIsVisible());
  const colsKey = headers.map((h) => h.column.id).join(",");
  // Keyed by content so memoized rows only re-render when columns really change.
  const visibleCols = useMemo(() => colsKey.split(",") as ColumnId[], [colsKey]);
  const cssVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const h of headers) vars[`--col-${h.column.id}`] = `${h.getSize()}px`;
    return vars as React.CSSProperties;
  }, [headers]);
  const totalWidth = headers.reduce((n, h) => n + h.getSize(), 0) + 40;

  useEffect(() => onOrderChange(rows.map((r) => r.id)), [rows, onOrderChange]);

  /* ── grid focus + editing ── */
  const [focusCol, setFocusCol] = useState<ColumnId>("title");
  const [editing, setEditing] = useState<EditTarget>(null);
  const focusedId = props.focusedId;
  const indexOf = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    getItemKey: (i) => rows[i]?.id ?? i,
  });
  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);
  useEffect(() => {
    const i = focusedId ? indexOf.get(focusedId) : undefined;
    if (i !== undefined) virtualizer.scrollToIndex(i, { align: "auto" });
  }, [focusedId, indexOf, virtualizer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || editing || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
          el.closest("[role=dialog],[role=listbox],[role=menu],[cmdk-root]"))
      )
        return;
      const rowIdx = focusedId ? (indexOf.get(focusedId) ?? -1) : -1;
      const colIdx = visibleCols.indexOf(focusCol);
      const focusRow = (i: number) => {
        const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
        if (r) onFocus(r.id);
      };
      switch (e.key) {
        case "ArrowDown":
        case "j":
          e.preventDefault();
          focusRow(rowIdx + 1);
          break;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          focusRow(rowIdx - 1);
          break;
        case "ArrowRight":
        case "l":
          if (e.key === "l" && rowIdx < 0) break;
          e.preventDefault();
          setFocusCol(visibleCols[Math.min(visibleCols.length - 1, colIdx + 1)] ?? focusCol);
          break;
        case "ArrowLeft":
        case "h":
          e.preventDefault();
          setFocusCol(visibleCols[Math.max(0, colIdx - 1)] ?? focusCol);
          break;
        case "Home":
          e.preventDefault();
          setFocusCol("title");
          break;
        case "End":
          e.preventDefault();
          setFocusCol(visibleCols.at(-1) ?? "title");
          break;
        case "Enter":
        case "F2":
          if (!focusedId) break;
          e.preventDefault();
          if (meta.can.edit && SPEC[focusCol].editable)
            setEditing({ rowId: focusedId, col: focusCol });
          break;
        case " ": {
          const r = focusedId ? rows[rowIdx] : undefined;
          if (r) {
            e.preventDefault();
            onOpen(r);
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, focusedId, focusCol, indexOf, meta.can.edit, onFocus, onOpen, rows, visibleCols]);

  const onCellClick = useCallback(
    (rowId: string, col: ColumnId) => {
      onFocus(rowId);
      setFocusCol(col);
    },
    [onFocus],
  );
  const onEdit = useCallback((target: EditTarget) => setEditing(target), []);

  /* ── header drag to reorder ── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const from = order.indexOf(e.active.id as ColumnId);
    const to = e.over ? order.indexOf(e.over.id as ColumnId) : -1;
    if (from < 1 || to < 1 || from === to) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    persistLayout(next, sizing);
  };

  const sortState = options.orderBy;
  const onSort = (field: OrderField) =>
    setOptions({
      orderBy:
        sortState.field !== field
          ? { field, dir: "asc" }
          : sortState.dir === "asc"
            ? { field, dir: "desc" }
            : { field: "manual", dir: "asc" },
    });

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 scrollbar-thin overflow-auto"
      style={cssVars}
      role="grid"
      aria-rowcount={rows.length + 1}
      aria-colcount={visibleCols.length}
      data-testid="table-view"
    >
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        <div
          role="row"
          className="sticky top-0 z-[3] flex h-9 border-b border-border bg-surface-muted text-small font-medium text-fg-secondary"
        >
          <DndContext
            id="table-columns"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={visibleCols} strategy={horizontalListSortingStrategy}>
              {headers.map((h) => {
                const id = h.column.id as ColumnId;
                const spec = SPEC[id];
                const sorted = spec.sort && sortState.field === spec.sort ? sortState.dir : null;
                return (
                  <HeaderCell
                    key={id}
                    id={id}
                    label={t(id === "title" ? "tableTitle" : `prop.${id}`)}
                    sorted={sorted}
                    onSort={spec.sort ? () => onSort(spec.sort as OrderField) : undefined}
                    resizeHandler={h.getResizeHandler()}
                    isResizing={h.column.getIsResizing()}
                    onResetSize={() => {
                      const next = { ...sizing };
                      delete next[id];
                      setSizing(next);
                      persistLayout(order, next);
                    }}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
          <div className="flex-1" />
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            if (!row) return null;
            const isFocused = row.id === focusedId;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                className="absolute top-0 left-0 w-full"
                style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
              >
                <TableRow
                  row={row}
                  cols={visibleCols}
                  meta={meta}
                  selected={props.selection.has(row.id)}
                  focusCol={isFocused ? focusCol : null}
                  editingCol={editing?.rowId === row.id ? editing.col : null}
                  onCellClick={onCellClick}
                  onEdit={onEdit}
                  onOpen={onOpen}
                  onUpdate={onUpdate}
                  onToggleSelect={props.onToggleSelect}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── header ───────────────────────── */

function HeaderCell({
  id,
  label,
  sorted,
  onSort,
  resizeHandler,
  isResizing,
  onResetSize,
}: {
  id: ColumnId;
  label: string;
  sorted: "asc" | "desc" | null;
  onSort?: () => void;
  resizeHandler: (e: unknown) => void;
  isResizing: boolean;
  onResetSize: () => void;
}) {
  const pinned = id === "title";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: pinned,
  });
  return (
    <div
      ref={setNodeRef}
      role="columnheader"
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
      className={cn(
        "group/th relative flex shrink-0 items-center border-r border-border/70 bg-surface-muted",
        pinned && "sticky left-0 z-[2]",
        isDragging && "z-[4] opacity-80 shadow-popover",
      )}
      style={{
        width: `var(--col-${id})`,
        transform: CSS.Translate.toString(transform),
        transition,
      }}
    >
      <button
        type="button"
        onClick={onSort}
        {...(pinned ? {} : attributes)}
        {...(pinned ? {} : listeners)}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1 px-3 text-left focus-ring",
          onSort ? "hover:text-fg" : "cursor-default",
          !pinned && "cursor-grab active:cursor-grabbing",
        )}
      >
        <span className="truncate">{label}</span>
        {sorted === "asc" ? <ArrowUp className="size-3.5 text-icon" /> : null}
        {sorted === "desc" ? <ArrowDown className="size-3.5 text-icon" /> : null}
      </button>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label}`}
        onMouseDown={resizeHandler}
        onTouchStart={resizeHandler}
        onDoubleClick={onResetSize}
        className={cn(
          "absolute top-0 right-[-3px] z-[1] h-full w-1.5 cursor-col-resize touch-none select-none",
          "after:absolute after:inset-y-1.5 after:left-[2px] after:w-0.5 after:rounded-full after:transition-colors",
          isResizing ? "after:bg-sky-600" : "group-hover/th:after:bg-border-strong",
        )}
      />
    </div>
  );
}

/* ───────────────────────── rows ───────────────────────── */

interface TableRowProps {
  row: WorkItemRow;
  cols: ColumnId[];
  meta: ProjectMeta;
  selected: boolean;
  focusCol: ColumnId | null;
  editingCol: ColumnId | null;
  onCellClick: (rowId: string, col: ColumnId) => void;
  onEdit: (target: EditTarget) => void;
  onOpen: (row: WorkItemRow) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onToggleSelect: (id: string, range?: boolean) => void;
}

/** Memoized: editing one cell re-renders only that row. */
const TableRow = memo(function TableRow(props: TableRowProps) {
  const { cols, selected, focusCol } = props;
  return (
    <div
      role="row"
      aria-selected={selected}
      data-testid="table-row"
      data-focused={focusCol ? true : undefined}
      className={cn(
        "group/row flex h-full border-b border-border text-body",
        selected ? "bg-surface-selected" : focusCol ? "bg-surface-hover" : "hover:bg-surface-hover",
      )}
    >
      {cols.map((col) => (
        <Cell key={col} col={col} {...props} />
      ))}
      <div className="flex-1" />
    </div>
  );
});

function Cell({
  col,
  row,
  meta,
  selected,
  focusCol,
  editingCol,
  onCellClick,
  onEdit,
  onOpen,
  onUpdate,
  onToggleSelect,
}: TableRowProps & { col: ColumnId }) {
  const t = useTranslations("items");
  const focused = focusCol === col;
  const editing = editingCol === col;
  const canEdit = meta.can.edit;
  const set = (patch: Record<string, unknown>) => onUpdate(row.id, patch);
  const picker = {
    open: editing ? true : undefined,
    onOpenChange: (o: boolean) => onEdit(o ? { rowId: row.id, col } : null),
    disabled: !canEdit,
  };

  let content: React.ReactNode;
  switch (col) {
    case "title":
      content = (
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-2">
          <span className="flex w-5 shrink-0 justify-center" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelect(row.id)}
              aria-label={row.identifier}
              className={cn(
                "transition-opacity",
                selected
                  ? "opacity-100"
                  : "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
              )}
            />
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(row);
            }}
            className="w-[72px] shrink-0 truncate text-left text-small font-medium text-fg-muted tabular focus-ring hover:text-fg"
          >
            {row.identifier}
          </button>
          {editing ? (
            <InlineText
              value={row.title}
              onCommit={(title) => {
                if (title.trim() && title.trim() !== row.title) set({ title: title.trim() });
                onEdit(null);
              }}
              onCancel={() => onEdit(null)}
            />
          ) : (
            <span
              className="min-w-0 flex-1 truncate font-medium text-fg"
              onDoubleClick={() => canEdit && onEdit({ rowId: row.id, col })}
            >
              {row.title}
            </span>
          )}
        </div>
      );
      break;
    case "state":
      content = (
        <StatePicker
          variant="field"
          meta={meta}
          value={row.stateId}
          onChange={(stateId) => set({ stateId })}
          {...picker}
        />
      );
      break;
    case "priority":
      content = (
        <PriorityPicker
          variant="field"
          value={row.priority}
          onChange={(priority) => set({ priority })}
          {...picker}
        />
      );
      break;
    case "assignees":
      content = (
        <AssigneePicker
          variant="field"
          meta={meta}
          value={row.assigneeIds}
          onChange={(assigneeIds) => set({ assigneeIds })}
          {...picker}
        />
      );
      break;
    case "labels":
      content = (
        <LabelPicker
          variant="field"
          meta={meta}
          value={row.labelIds}
          onChange={(labelIds) => set({ labelIds })}
          {...picker}
        />
      );
      break;
    case "type":
      content = (
        <TypePicker
          variant="field"
          meta={meta}
          value={row.typeId}
          onChange={(typeId) => set({ typeId })}
          {...picker}
        />
      );
      break;
    case "startDate":
    case "dueDate":
      content = (
        <DatePicker
          variant="field"
          label={t(col === "dueDate" ? "setDue" : "setStart")}
          value={row[col]}
          highlightOverdue={
            col === "dueDate" && row.stateGroup !== "COMPLETED" && row.stateGroup !== "CANCELLED"
          }
          onChange={(v) => set({ [col]: v })}
          {...picker}
        />
      );
      break;
    case "estimate":
      content = editing ? (
        <InlineText
          numeric
          value={row.estimate == null ? "" : String(row.estimate)}
          onCommit={(v) => {
            const n = v.trim() === "" ? null : Number(v);
            if (n === null || (Number.isFinite(n) && n >= 0)) set({ estimate: n });
            onEdit(null);
          }}
          onCancel={() => onEdit(null)}
        />
      ) : (
        <span
          className={cn("px-2 tabular", row.estimate == null && "text-fg-placeholder")}
          onDoubleClick={() => canEdit && onEdit({ rowId: row.id, col })}
        >
          {row.estimate ?? "—"}
        </span>
      );
      break;
    case "subItems":
      content =
        row.childCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 px-2 text-small text-fg-muted tabular">
            <ProgressRing value={row.childDoneCount} total={row.childCount} />
            {row.childDoneCount}/{row.childCount}
          </span>
        ) : null;
      break;
    case "createdAt":
    case "updatedAt":
      content = (
        <span className="px-2 text-small text-fg-muted tabular">
          {format(parseISO(row[col]), "d MMM yyyy")}
        </span>
      );
      break;
  }

  return (
    <div
      role="gridcell"
      aria-selected={focused}
      data-col={col}
      onClick={() => onCellClick(row.id, col)}
      className={cn(
        "relative flex h-full shrink-0 items-center overflow-hidden border-r border-border/70 px-1",
        col === "title" &&
          (selected
            ? "sticky left-0 z-[1] bg-surface-selected"
            : "sticky left-0 z-[1] bg-surface group-hover/row:bg-surface-hover"),
        col === "title" && focusCol && !selected && "bg-surface-hover",
        focused && "outline-2 -outline-offset-2 outline-sky-500",
      )}
      style={{ width: `var(--col-${col})` }}
    >
      {content}
    </div>
  );
}

function InlineText({
  value,
  onCommit,
  onCancel,
  numeric = false,
}: {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  numeric?: boolean;
}) {
  const [text, setText] = useState(value);
  const done = useRef(false);
  return (
    <input
      autoFocus
      value={text}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          done.current = true;
          onCommit(text);
        } else if (e.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!done.current) onCommit(text);
      }}
      onClick={(e) => e.stopPropagation()}
      className="h-7 min-w-0 flex-1 rounded-[6px] border border-sky-300 bg-surface px-1.5 text-body outline-none"
    />
  );
}
