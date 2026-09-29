"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { keyBetween } from "@dopl/shared/sort-keys";
import type { DisplayOptions } from "@dopl/shared/schemas/view";
import { cn } from "@/lib/cn";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Tooltip } from "@/components/ui/tooltip";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Tag, TagDot, Overflow } from "@/components/ui/tag";
import { StateIcon } from "@/components/icons/state-icon";
import { PriorityIcon } from "@/components/icons/priority-icon";
import { DatePicker, PriorityPicker } from "./pickers";
import { TypeIcon } from "./type-icon";
import { patchForGroup, type ItemGroup } from "./grouping";
import type { ProjectMeta, WorkItemRow } from "./types";

const cardId = (groupKey: string, rowId: string) => `${groupKey}::${rowId}`;
const parseCardId = (id: string) => {
  const i = id.lastIndexOf("::");
  return { groupKey: id.slice(0, i), rowId: id.slice(i + 2) };
};

export interface BoardViewProps {
  groups: ItemGroup[];
  meta: ProjectMeta;
  options: DisplayOptions;
  hiddenByState: Record<string, number>;
  onShowDone: () => void;
  onOpen: (row: WorkItemRow) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onMove: (input: {
    id: string;
    beforeId: string | null;
    afterId: string | null;
    optimisticKey: string;
  }) => void;
  onCreateInGroup: (group: ItemGroup) => void;
  focusedId: string | null;
  onFocus: (id: string) => void;
}

export function BoardView(props: BoardViewProps) {
  const { groups, meta, options } = props;
  const t = useTranslations("items");
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeRow = useMemo(() => {
    if (!activeId) return null;
    const { rowId } = parseCardId(activeId);
    for (const g of groups) {
      const r = g.rows.find((x) => x.id === rowId);
      if (r) return r;
    }
    return null;
  }, [activeId, groups]);

  const collapsedDone = (g: ItemGroup) =>
    Boolean(g.done) && options.completed === "hide" && g.rows.length === 0;

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !meta.can.edit) return;
    const from = parseCardId(String(active.id));
    const fromGroup = groups.find((g) => g.key === from.groupKey);
    const row = fromGroup?.rows.find((r) => r.id === from.rowId);
    if (!fromGroup || !row) return;
    const overId = String(over.id);
    const toGroup = overId.includes("::")
      ? groups.find((g) => g.key === parseCardId(overId).groupKey)
      : groups.find((g) => g.key === overId);
    if (!toGroup) return;

    // Neighbours in the target column after the drop.
    let target: WorkItemRow[];
    if (toGroup.key === fromGroup.key) {
      const oldIndex = toGroup.rows.findIndex((r) => r.id === row.id);
      const newIndex = overId.includes("::")
        ? toGroup.rows.findIndex((r) => r.id === parseCardId(overId).rowId)
        : toGroup.rows.length - 1;
      if (oldIndex === newIndex || newIndex < 0) return;
      target = arrayMove(toGroup.rows, oldIndex, newIndex);
    } else {
      const without = toGroup.rows.filter((r) => r.id !== row.id);
      const overIndex = overId.includes("::")
        ? without.findIndex((r) => r.id === parseCardId(overId).rowId)
        : without.length;
      target = [
        ...without.slice(0, Math.max(0, overIndex)),
        row,
        ...without.slice(Math.max(0, overIndex)),
      ];
    }
    const idx = target.findIndex((r) => r.id === row.id);
    const before = target[idx - 1] ?? null;
    const after = target[idx + 1] ?? null;

    const patch = patchForGroup(row, fromGroup, toGroup);
    if (patch) props.onUpdate(row.id, patch);
    if (options.orderBy.field === "manual") {
      let optimisticKey: string;
      try {
        optimisticKey = keyBetween(before?.sortKey ?? null, after?.sortKey ?? null);
      } catch {
        optimisticKey = row.sortKey;
      }
      props.onMove({
        id: row.id,
        beforeId: before?.id ?? null,
        afterId: after?.id ?? null,
        optimisticKey,
      });
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        className="flex min-h-0 flex-1 scrollbar-thin gap-3 overflow-x-auto bg-surface-muted p-3"
        data-testid="board"
      >
        {groups.map((group) =>
          collapsedDone(group) ? (
            <CollapsedColumn
              key={group.key}
              group={group}
              hidden={group.value ? (props.hiddenByState[group.value] ?? 0) : 0}
              onShow={props.onShowDone}
            />
          ) : (
            <Column key={group.key} group={group} {...props} activeId={activeId} t={t} />
          ),
        )}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeRow ? <Card row={activeRow} meta={meta} options={options} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function CollapsedColumn({
  group,
  hidden,
  onShow,
}: {
  group: ItemGroup;
  hidden: number;
  onShow: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onShow}
      className="flex w-11 shrink-0 flex-col items-center gap-2 rounded-card border border-dashed border-border-strong py-3 text-small text-fg-muted focus-ring hover:bg-surface"
    >
      {group.state ? <StateIcon group={group.state.group} color={group.state.color} /> : null}
      <span className="font-medium [writing-mode:vertical-rl]">{group.label}</span>
      <span className="tabular">{hidden}</span>
    </button>
  );
}

function Column({
  group,
  meta,
  options,
  onOpen,
  onUpdate,
  onCreateInGroup,
  activeId,
  focusedId,
  onFocus,
  t,
}: BoardViewProps & {
  group: ItemGroup;
  activeId: string | null;
  t: ReturnType<typeof useTranslations<"items">>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group.key });
  const ids = group.rows.map((r) => cardId(group.key, r.id));
  const user = group.userId ? meta.members.find((m) => m.id === group.userId) : null;
  return (
    <section className="flex w-[296px] shrink-0 flex-col" aria-label={group.label}>
      <header className="group/col flex h-9 items-center gap-2 px-1.5">
        {group.state ? <StateIcon group={group.state.group} color={group.state.color} /> : null}
        {group.priority ? <PriorityIcon priority={group.priority} /> : null}
        {group.color ? <TagDot color={group.color} /> : null}
        {group.typeIcon ? (
          <TypeIcon icon={group.typeIcon.icon} color={group.typeIcon.color} />
        ) : null}
        {user ? <Avatar user={user} size="xs" /> : null}
        <h3 className="truncate text-body font-medium">{group.label || t("title")}</h3>
        <span className="text-small text-fg-muted tabular">{group.rows.length}</span>
        {meta.can.create ? (
          <Tooltip content={t("newItem")} shortcut="c">
            <button
              type="button"
              aria-label={t("newItem")}
              onClick={() => onCreateInGroup(group)}
              className="ml-auto inline-flex size-6 items-center justify-center rounded-[7px] text-icon focus-ring hover:bg-neutral-150 hover:text-fg"
            >
              <Plus className="size-4" />
            </button>
          </Tooltip>
        ) : null}
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 scrollbar-thin flex-col gap-2 overflow-y-auto rounded-card p-1 pb-8 transition-colors",
          isOver && "bg-sky-50/70 outline-1 outline-sky-300 outline-dashed",
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {group.rows.map((row) => (
            <SortableCard
              key={cardId(group.key, row.id)}
              id={cardId(group.key, row.id)}
              row={row}
              meta={meta}
              options={options}
              hidden={activeId === cardId(group.key, row.id)}
              focused={focusedId === row.id}
              onOpen={() => onOpen(row)}
              onFocus={() => onFocus(row.id)}
              onUpdate={onUpdate}
            />
          ))}
        </SortableContext>
        {group.rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-small text-fg-muted">{t("emptyGroup")}</p>
        ) : null}
      </div>
    </section>
  );
}

function SortableCard({
  id,
  hidden,
  focused,
  onOpen,
  onFocus,
  ...rest
}: {
  id: string;
  row: WorkItemRow;
  meta: ProjectMeta;
  options: DisplayOptions;
  hidden: boolean;
  focused: boolean;
  onOpen: () => void;
  onFocus: () => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onMouseEnter={onFocus}
      className={cn(
        "rounded-card outline-none focus-visible:ring-2 focus-visible:ring-focus",
        hidden && "opacity-40",
      )}
    >
      <Card {...rest} focused={focused} />
    </div>
  );
}

function Card({
  row,
  meta,
  options,
  overlay,
  focused,
  onUpdate,
}: {
  row: WorkItemRow;
  meta: ProjectMeta;
  options: DisplayOptions;
  overlay?: boolean;
  focused?: boolean;
  onUpdate?: (id: string, patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("items");
  const show = (p: DisplayOptions["properties"][number]) => options.properties.includes(p);
  const labels = row.labelIds
    .map((id) => meta.labels.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  const users = row.assigneeIds
    .map((id) => meta.members.find((m) => m.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  const state = meta.states.find((s) => s.id === row.stateId);
  const compact = options.density === "compact";
  return (
    <article
      data-testid="board-card"
      className={cn(
        "flex cursor-grab flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-card active:cursor-grabbing",
        compact && "gap-1.5 p-2.5",
        focused && "border-sky-300",
        overlay && "rotate-[1.5deg] shadow-drag",
      )}
    >
      <div className="flex items-center gap-1.5">
        {show("identifier") ? (
          <span className="text-small font-medium text-fg-muted tabular">{row.identifier}</span>
        ) : null}
        {state && options.groupBy !== "state" ? (
          <StateIcon group={state.group} color={state.color} size={14} />
        ) : null}
        <span
          className="ml-auto"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {show("priority") && onUpdate ? (
            <PriorityPicker
              value={row.priority}
              onChange={(priority) => onUpdate(row.id, { priority })}
              disabled={!meta.can.edit}
            />
          ) : show("priority") ? (
            <PriorityIcon priority={row.priority} />
          ) : null}
        </span>
      </div>
      <p className={cn("line-clamp-2 font-medium text-fg", compact ? "text-small" : "text-body")}>
        {row.title}
      </p>
      {!compact || labels.length || row.dueDate || users.length ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {show("labels") ? (
            <>
              {labels.slice(0, 2).map((l) => (
                <Tag key={l.id} color={l.color}>
                  {l.name}
                </Tag>
              ))}
              <Overflow count={labels.length - 2} />
            </>
          ) : null}
          {show("dueDate") && row.dueDate && onUpdate ? (
            <DatePicker
              label={t("setDue")}
              value={row.dueDate}
              highlightOverdue={row.stateGroup !== "COMPLETED" && row.stateGroup !== "CANCELLED"}
              onChange={(dueDate) => onUpdate(row.id, { dueDate })}
              disabled={!meta.can.edit}
            />
          ) : null}
          {show("subItems") && row.childCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-small text-fg-muted tabular">
              <ProgressRing value={row.childDoneCount} total={row.childCount} />
              {row.childDoneCount}/{row.childCount}
            </span>
          ) : null}
          {show("assignees") && users.length ? (
            <span className="ml-auto">
              <AvatarStack users={users} size="xs" />
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
