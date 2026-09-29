"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { ChevronRight, Plus, Eye } from "lucide-react";
import type { DisplayOptions } from "@dopl/shared/schemas/view";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Tooltip } from "@/components/ui/tooltip";
import { Avatar } from "@/components/ui/avatar";
import { TagDot } from "@/components/ui/tag";
import { StateIcon } from "@/components/icons/state-icon";
import { PriorityIcon } from "@/components/icons/priority-icon";
import {
  AssigneePicker,
  DatePicker,
  LabelPicker,
  PriorityPicker,
  StatePicker,
  TypePicker,
} from "./pickers";
import { TypeIcon } from "./type-icon";
import type { ItemGroup } from "./grouping";
import type { ProjectMeta, WorkItemRow } from "./types";

export type PickerKind = "state" | "priority" | "assignee" | "label" | "due";

type VRow =
  | { kind: "group"; group: ItemGroup; collapsed: boolean }
  | { kind: "item"; row: WorkItemRow; group: ItemGroup };

export interface ListViewProps {
  groups: ItemGroup[];
  meta: ProjectMeta;
  options: DisplayOptions;
  collapsed: Set<string>;
  onToggleGroup: (key: string) => void;
  hiddenByState: Record<string, number>;
  onShowDone: () => void;
  selection: Set<string>;
  onToggleSelect: (id: string, range?: boolean) => void;
  focusedId: string | null;
  onFocus: (id: string) => void;
  onOpen: (row: WorkItemRow) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onCreateInGroup: (group: ItemGroup) => void;
  openPicker: { id: string; kind: PickerKind } | null;
  onPickerChange: (value: { id: string; kind: PickerKind } | null) => void;
  /** Visual order of item ids (for j/k and range selection). */
  onOrderChange: (ids: string[]) => void;
}

const GROUP_HEIGHT = 40;

export function ListView(props: ListViewProps) {
  const { groups, options, collapsed, meta } = props;
  const t = useTranslations("items");
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = options.density === "compact" ? 36 : 52;
  const showHeaders = options.groupBy !== "none";

  const vrows = useMemo<VRow[]>(() => {
    const out: VRow[] = [];
    for (const group of groups) {
      const isCollapsed =
        collapsed.has(group.key) ||
        (Boolean(group.done) && options.completed === "hide" && group.rows.length === 0);
      if (showHeaders) out.push({ kind: "group", group, collapsed: isCollapsed });
      if (!isCollapsed) for (const row of group.rows) out.push({ kind: "item", row, group });
    }
    return out;
  }, [groups, collapsed, options.completed, showHeaders]);

  const { onOrderChange } = props;
  useEffect(() => {
    onOrderChange(
      vrows
        .filter((v): v is Extract<VRow, { kind: "item" }> => v.kind === "item")
        .map((v) => v.row.id),
    );
  }, [vrows, onOrderChange]);

  const groupIndexes = useMemo(
    () => vrows.flatMap((v, i) => (v.kind === "group" ? [i] : [])),
    [vrows],
  );
  const activeGroup = useRef(0);
  const rangeExtractor = useCallback(
    (range: Range) => {
      activeGroup.current = [...groupIndexes].reverse().find((i) => range.startIndex >= i) ?? 0;
      const next = new Set([activeGroup.current, ...defaultRangeExtractor(range)]);
      return [...next].sort((a, b) => a - b);
    },
    [groupIndexes],
  );

  const virtualizer = useVirtualizer({
    count: vrows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (vrows[i]?.kind === "group" ? GROUP_HEIGHT : rowHeight),
    overscan: 16,
    rangeExtractor: showHeaders ? rangeExtractor : undefined,
    getItemKey: (i) => {
      const v = vrows[i];
      return v?.kind === "group" ? v.group.key : `${v?.group.key}::${v?.row.id}`;
    },
  });
  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);

  // Keep the keyboard-focused row in view.
  useEffect(() => {
    if (!props.focusedId) return;
    const idx = vrows.findIndex((v) => v.kind === "item" && v.row.id === props.focusedId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [props.focusedId, vrows, virtualizer]);

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 scrollbar-thin overflow-y-auto"
      role="grid"
      aria-rowcount={vrows.length}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const v = vrows[vi.index];
          if (!v) return null;
          const isStickyActive =
            showHeaders && v.kind === "group" && activeGroup.current === vi.index;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              style={
                isStickyActive
                  ? { position: "sticky", top: 0, zIndex: 2, height: vi.size }
                  : {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: vi.size,
                      transform: `translateY(${vi.start}px)`,
                    }
              }
            >
              {v.kind === "group" ? (
                <GroupHeader
                  group={v.group}
                  collapsed={v.collapsed}
                  onToggle={() => props.onToggleGroup(v.group.key)}
                  onCreate={meta.can.create ? () => props.onCreateInGroup(v.group) : undefined}
                  hiddenDone={
                    v.group.done && options.completed !== "show" && v.group.value
                      ? (props.hiddenByState[v.group.value] ?? 0)
                      : 0
                  }
                  onShowDone={props.onShowDone}
                  meta={meta}
                  t={t}
                />
              ) : (
                <ItemRow {...props} row={v.row} rowHeight={rowHeight} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupHeader({
  group,
  collapsed,
  onToggle,
  onCreate,
  hiddenDone,
  onShowDone,
  meta,
  t,
}: {
  group: ItemGroup;
  collapsed: boolean;
  onToggle: () => void;
  onCreate?: () => void;
  hiddenDone: number;
  onShowDone: () => void;
  meta: ProjectMeta;
  t: ReturnType<typeof useTranslations<"items">>;
}) {
  const user = group.userId ? meta.members.find((m) => m.id === group.userId) : null;
  return (
    <div
      data-testid="group-header"
      data-group={group.label}
      className="group/header flex h-10 items-center gap-2 border-b border-border bg-surface-muted pr-3 pl-3"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex min-w-0 items-center gap-2 rounded-[6px] py-1 text-body font-medium text-fg focus-ring"
      >
        <ChevronRight
          className={cn(
            "size-3.5 text-icon transition-transform duration-[var(--dur-fast)]",
            !collapsed && "rotate-90",
          )}
        />
        {group.state ? <StateIcon group={group.state.group} color={group.state.color} /> : null}
        {group.priority ? <PriorityIcon priority={group.priority} /> : null}
        {group.color ? <TagDot color={group.color} /> : null}
        {group.typeIcon ? (
          <TypeIcon icon={group.typeIcon.icon} color={group.typeIcon.color} />
        ) : null}
        {user ? <Avatar user={user} size="xs" /> : null}
        <span className="truncate">{group.label}</span>
        <span className="text-small font-normal text-fg-muted tabular">{group.rows.length}</span>
      </button>
      {hiddenDone > 0 ? (
        <button
          type="button"
          onClick={onShowDone}
          className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-small text-fg-muted focus-ring hover:bg-neutral-150 hover:text-fg"
        >
          <Eye className="size-3.5" />
          {t("doneHidden", { count: hiddenDone })}
        </button>
      ) : null}
      {onCreate ? (
        <Tooltip content={t("newItem")} shortcut="c">
          <button
            type="button"
            onClick={onCreate}
            aria-label={t("newItem")}
            className="ml-auto inline-flex size-6 items-center justify-center rounded-[7px] text-icon opacity-0 focus-ring transition-opacity group-hover/header:opacity-100 hover:bg-neutral-150 hover:text-fg focus-visible:opacity-100"
          >
            <Plus className="size-4" />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}

function ItemRow({
  row,
  meta,
  options,
  selection,
  onToggleSelect,
  focusedId,
  onFocus,
  onOpen,
  onUpdate,
  openPicker,
  onPickerChange,
  rowHeight,
}: ListViewProps & { row: WorkItemRow; rowHeight: number }) {
  const t = useTranslations("items");
  const selected = selection.has(row.id);
  const focused = focusedId === row.id;
  const show = (p: DisplayOptions["properties"][number]) => options.properties.includes(p);
  const canEdit = meta.can.edit;
  const picker = (kind: PickerKind) => ({
    open: openPicker?.id === row.id && openPicker.kind === kind ? true : undefined,
    onOpenChange: (o: boolean) => onPickerChange(o ? { id: row.id, kind } : null),
  });
  const type = row.typeId ? meta.types.find((x) => x.id === row.typeId) : null;
  const compact = rowHeight < 44;

  return (
    <div
      role="row"
      aria-selected={selected}
      data-focused={focused || undefined}
      data-testid="item-row"
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onToggleSelect(row.id, e.shiftKey);
          return;
        }
        onFocus(row.id);
        onOpen(row);
      }}
      onMouseEnter={() => onFocus(row.id)}
      className={cn(
        "group/row relative flex h-full cursor-default items-center gap-2 border-b border-border pr-4 pl-3",
        "transition-colors duration-[var(--dur-fast)]",
        selected ? "bg-surface-selected" : focused ? "bg-surface-hover" : "hover:bg-surface-hover",
        focused && "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-sky-600",
      )}
    >
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
      {show("priority") ? (
        <PriorityPicker
          value={row.priority}
          onChange={(priority) => onUpdate(row.id, { priority })}
          disabled={!canEdit}
          {...picker("priority")}
        />
      ) : null}
      {show("identifier") ? (
        <span className="w-[76px] shrink-0 truncate text-small font-medium text-fg-muted tabular">
          {row.identifier}
        </span>
      ) : null}
      {show("state") ? (
        <StatePicker
          meta={meta}
          value={row.stateId}
          onChange={(stateId) => onUpdate(row.id, { stateId })}
          disabled={!canEdit}
          {...picker("state")}
        />
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium text-fg",
          compact ? "text-small" : "text-body",
        )}
      >
        {row.title}
      </span>
      {show("subItems") && row.childCount > 0 ? (
        <span className="hidden shrink-0 items-center gap-1 text-small text-fg-muted tabular sm:inline-flex">
          <ProgressRing value={row.childDoneCount} total={row.childCount} />
          {row.childDoneCount}/{row.childCount}
        </span>
      ) : null}
      <div
        className="ml-2 hidden shrink-0 items-center gap-1.5 md:flex"
        onClick={(e) => e.stopPropagation()}
      >
        {show("labels") ? (
          <LabelPicker
            meta={meta}
            projectId={row.projectId}
            value={row.labelIds}
            onChange={(labelIds) => onUpdate(row.id, { labelIds })}
            disabled={!canEdit}
            {...picker("label")}
          />
        ) : null}
        {show("type") && type ? (
          <TypePicker
            meta={meta}
            value={row.typeId}
            onChange={(typeId) => onUpdate(row.id, { typeId })}
            disabled={!canEdit}
          />
        ) : null}
        {show("startDate") ? (
          <DatePicker
            label={t("setStart")}
            value={row.startDate}
            highlightOverdue={false}
            onChange={(startDate) => onUpdate(row.id, { startDate })}
            disabled={!canEdit}
          />
        ) : null}
        {show("dueDate") ? (
          <DatePicker
            label={t("setDue")}
            value={row.dueDate}
            highlightOverdue={row.stateGroup !== "COMPLETED" && row.stateGroup !== "CANCELLED"}
            onChange={(dueDate) => onUpdate(row.id, { dueDate })}
            disabled={!canEdit}
            {...picker("due")}
          />
        ) : null}
        {show("estimate") && row.estimate != null ? (
          <span className="inline-flex h-6 items-center rounded-[7px] border border-border px-1.5 text-small text-fg-secondary tabular">
            {row.estimate}
          </span>
        ) : null}
      </div>
      {show("assignees") ? (
        <span onClick={(e) => e.stopPropagation()} className="shrink-0">
          <AssigneePicker
            meta={meta}
            value={row.assigneeIds}
            onChange={(assigneeIds) => onUpdate(row.id, { assigneeIds })}
            disabled={!canEdit}
            {...picker("assignee")}
          />
        </span>
      ) : null}
    </div>
  );
}
