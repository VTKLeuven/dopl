"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowUpDown,
  CalendarDays,
  Columns3,
  GanttChart,
  Eye,
  EyeOff,
  LayoutList,
  ListTodo,
  Plus,
  Search,
  Settings,
  Sheet,
  SlidersHorizontal,
  Trash,
  X,
} from "lucide-react";
import {
  DisplayOptionsSchema,
  type DisplayOptions,
  type GroupKey,
  type OrderField,
  type PropertyKey,
} from "@dopl/shared/schemas/view";
import type { Priority } from "@dopl/shared/schemas/work-item";
import { EMPTY_FILTER, isEmptyFilter, type FilterGroup } from "@dopl/shared/schemas/filters";
import { FilterBar } from "@/features/filters/filter-bar";
import { FilterButton } from "@/features/filters/filter-builder";
import { cn } from "@/lib/cn";
import { saveViewPreferenceAction } from "@/server/actions/view-preferences";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import {
  filterKey,
  useBlockingRelations,
  useBulkUpdate,
  useDeleteItems,
  useMoveItem,
  useProjectItems,
  useProjectMeta,
  useUpdateItem,
  type BlockingRelation,
  type ItemsData,
} from "./data";
import { defaultsForGroup, groupRows, sortRows, type ItemGroup } from "./grouping";
import { TableView } from "./table-view";
import { CalendarView } from "./calendar-view";
import { TimelineView } from "./timeline-view";
import { ListView, type PickerKind } from "./list-view";
import { BoardView } from "./board-view";
import { CreateItemDialog, type CreateDefaults } from "./create-item-dialog";
import { PeekPanel } from "./peek-panel";
import { AssigneePicker, LabelPicker, PriorityPicker, StatePicker } from "./pickers";
import type { ProjectMeta, WorkItemRow } from "./types";

const GROUP_KEYS: GroupKey[] = ["state", "priority", "assignee", "label", "type", "none"];
const ORDER_FIELDS: OrderField[] = [
  "manual",
  "priority",
  "dueDate",
  "startDate",
  "createdAt",
  "updatedAt",
  "title",
  "sequence",
];
const PROPERTY_KEYS: PropertyKey[] = [
  "identifier",
  "state",
  "priority",
  "labels",
  "dueDate",
  "startDate",
  "assignees",
  "subItems",
  "type",
  "estimate",
  "createdAt",
  "updatedAt",
];
const NO_RELATIONS: BlockingRelation[] = [];
/** Keys the table handles itself (grid navigation and cell editing). */
const TABLE_KEYS = new Set(["j", "k", "ArrowDown", "ArrowUp", "Enter", "s", "p", "a", "l", "d"]);

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    Boolean(el.closest("[role=dialog],[role=listbox],[cmdk-root]"))
  );
}

export function ProjectItemsView({
  ws,
  projectId,
  initialItems,
  initialMeta,
  initialOptions,
  initialFilters,
}: {
  ws: string;
  projectId: string;
  initialItems: ItemsData;
  initialMeta: ProjectMeta;
  initialOptions: DisplayOptions;
  initialFilters: FilterGroup;
}) {
  const t = useTranslations("items");
  const tf = useTranslations("filters");
  const [options, setOptionsState] = useState<DisplayOptions>(initialOptions);
  const [filters, setFiltersState] = useState<FilterGroup>(initialFilters);
  const { data: meta = initialMeta } = useProjectMeta(ws, projectId, initialMeta);
  const { data: items, isPlaceholderData } = useProjectItems(
    ws,
    projectId,
    { completed: options.completed, filters },
    options.completed === initialOptions.completed &&
      filterKey(filters) === filterKey(initialFilters)
      ? initialItems
      : undefined,
  );
  const { mutate: updateItem } = useUpdateItem(ws, projectId);
  const { data: relations } = useBlockingRelations(ws, projectId, options.layout === "TIMELINE");
  const bulk = useBulkUpdate(ws, projectId);
  const move = useMoveItem(ws, projectId);
  const del = useDeleteItems(ws, projectId);

  const [peek, setPeek] = useQueryState("peek", parseAsString);
  const [, setFilterParam] = useQueryState("f", parseAsString);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<{ id: string; kind: PickerKind } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<CreateDefaults | null>(null);
  const orderRef = useRef<string[]>([]);
  const lastSelected = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Persist display options and filters per user (debounced).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ options: initialOptions, filters: initialFilters });
  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () =>
        void saveViewPreferenceAction(
          ws,
          `project:${projectId}`,
          latest.current.options,
          latest.current.filters,
        ),
      600,
    );
  }, [ws, projectId]);
  const setOptions = useCallback(
    (patch: Partial<DisplayOptions>) => {
      const next = DisplayOptionsSchema.parse({ ...latest.current.options, ...patch });
      latest.current.options = next;
      setOptionsState(next);
      persist();
    },
    [persist],
  );
  const setFilters = useCallback(
    (next: FilterGroup) => {
      latest.current.filters = next;
      setFiltersState(next);
      void setFilterParam(filterKey(next) || null);
      persist();
    },
    [persist, setFilterParam],
  );

  const rows = useMemo(() => {
    const all = items?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) => r.title.toLowerCase().includes(q) || r.identifier.toLowerCase().includes(q),
    );
  }, [items, search]);

  const groups = useMemo(
    () =>
      groupRows(rows, options, meta, {
        none: {
          state: "",
          priority: "",
          assignee: t("noAssignee"),
          label: t("noLabel"),
          type: t("noType"),
          none: "",
        },
        priority: (p: Priority) => t(`priority.${p}`),
      }),
    [rows, options, meta, t],
  );

  const tableRows = useMemo(
    () => sortRows(options.showSubItems ? rows : rows.filter((r) => !r.parentId), options.orderBy),
    [rows, options.showSubItems, options.orderBy],
  );

  const rowById = useMemo(() => new Map((items?.rows ?? []).map((r) => [r.id, r])), [items]);
  // `mutate` is stable, so memoized rows don't re-render when a mutation starts.
  const onUpdate = useCallback(
    (id: string, patch: Record<string, unknown>) => updateItem({ id, ...patch }),
    [updateItem],
  );
  const onOpen = useCallback((row: WorkItemRow) => void setPeek(row.identifier), [setPeek]);
  const onOrderChange = useCallback((ids: string[]) => {
    orderRef.current = ids;
  }, []);
  const toggleSelect = useCallback((id: string, range?: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (range && lastSelected.current) {
        const order = orderRef.current;
        const a = order.indexOf(lastSelected.current);
        const b = order.indexOf(id);
        if (a >= 0 && b >= 0)
          for (const x of order.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      lastSelected.current = id;
      return next;
    });
  }, []);
  const toggleDone = useCallback(
    () => setOptions({ completed: options.completed === "show" ? "hide" : "show" }),
    [options.completed, setOptions],
  );
  const createInGroup = useCallback(
    (group?: ItemGroup) => setCreating(defaultsForGroup(group) as CreateDefaults),
    [],
  );

  // Keyboard layer (DESIGN_SYSTEM §7.1)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target) || creating) return;
      const mod = e.metaKey || e.ctrlKey;
      const order = orderRef.current;
      const focusAt = (delta: number) => {
        const i = focusedId ? order.indexOf(focusedId) : -1;
        const next = order[Math.min(order.length - 1, Math.max(0, i + delta))];
        if (next) {
          setFocusedId(next);
          if (peek) {
            const r = rowById.get(next);
            if (r) void setPeek(r.identifier);
          }
        }
      };
      if (mod && e.key === "Backspace") {
        const ids = selection.size ? [...selection] : focusedId ? [focusedId] : [];
        if (ids.length && meta.can.delete) {
          e.preventDefault();
          del.mutate(ids);
          setSelection(new Set());
        }
        return;
      }
      if (mod || e.altKey) return;
      if (options.layout !== "LIST" && options.layout !== "BOARD" && TABLE_KEYS.has(e.key)) return;
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          focusAt(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          focusAt(-1);
          break;
        case "Enter": {
          const r = focusedId ? rowById.get(focusedId) : null;
          if (r) void setPeek(r.identifier);
          break;
        }
        case "Escape":
          if (peek) void setPeek(null);
          else setSelection(new Set());
          break;
        case "x":
          if (focusedId) toggleSelect(focusedId);
          break;
        case "c":
          if (meta.can.create) {
            e.preventDefault();
            createInGroup(undefined);
          }
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "H":
          if (e.shiftKey) toggleDone();
          break;
        case "s":
        case "p":
        case "a":
        case "l":
        case "d": {
          if (!focusedId || !meta.can.edit || options.layout !== "LIST") break;
          e.preventDefault();
          const kind = (
            { s: "state", p: "priority", a: "assignee", l: "label", d: "due" } as const
          )[e.key];
          setOpenPicker({ id: focusedId, kind });
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    focusedId,
    peek,
    rowById,
    selection,
    meta.can,
    options.layout,
    creating,
    del,
    setPeek,
    toggleSelect,
    toggleDone,
    createInGroup,
  ]);

  const hidden = items?.hiddenDone ?? 0;
  const filtered = !isEmptyFilter(filters);
  const isEmpty = (items?.rows.length ?? 0) === 0 && !filtered;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-density={options.density}>
      <PageHeader
        crumbs={[
          {
            label: meta.project.name,
            icon: <ProjectBadge name={meta.project.name} color={meta.project.color} size={18} />,
            href: `/${ws}/p/${meta.project.identifier}/items`,
          },
          { label: t("title") },
        ]}
        actions={
          <>
            <SegmentedControl
              value={options.layout}
              onValueChange={(v) => setOptions({ layout: v as DisplayOptions["layout"] })}
              label={t("displayOptions")}
              className="hidden sm:inline-flex"
            >
              <Tooltip content={t("layout.LIST")}>
                <SegmentedControlItem value="LIST" aria-label={t("layout.LIST")}>
                  <LayoutList />
                </SegmentedControlItem>
              </Tooltip>
              <Tooltip content={t("layout.BOARD")}>
                <SegmentedControlItem value="BOARD" aria-label={t("layout.BOARD")}>
                  <Columns3 />
                </SegmentedControlItem>
              </Tooltip>
              <Tooltip content={t("layout.TABLE")}>
                <SegmentedControlItem value="TABLE" aria-label={t("layout.TABLE")}>
                  <Sheet />
                </SegmentedControlItem>
              </Tooltip>
              <Tooltip content={t("layout.CALENDAR")}>
                <SegmentedControlItem value="CALENDAR" aria-label={t("layout.CALENDAR")}>
                  <CalendarDays />
                </SegmentedControlItem>
              </Tooltip>
              <Tooltip content={t("layout.TIMELINE")}>
                <SegmentedControlItem value="TIMELINE" aria-label={t("layout.TIMELINE")}>
                  <GanttChart />
                </SegmentedControlItem>
              </Tooltip>
            </SegmentedControl>
            <DisplayOptionsButton options={options} setOptions={setOptions} />
            {meta.can.manage ? (
              <Tooltip content={t("projectSettings")}>
                <Button
                  size="icon"
                  asChild
                  aria-label={t("projectSettings")}
                  className="hidden sm:inline-flex"
                >
                  <Link href={`/${ws}/p/${meta.project.identifier}/settings` as never}>
                    <Settings />
                  </Link>
                </Button>
              </Tooltip>
            ) : null}
            {meta.can.create ? (
              <Tooltip content={t("newItem")} shortcut="c">
                <Button
                  variant="primary"
                  onClick={() => createInGroup(undefined)}
                  data-testid="new-item"
                >
                  <Plus />
                  <span className="hidden sm:inline">{t("newItem")}</span>
                </Button>
              </Tooltip>
            ) : null}
          </>
        }
      />
      <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b border-border px-4 md:px-5">
        <div className="relative w-full max-w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-icon" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), setSearch(""))}
            placeholder={t("searchPlaceholder")}
            className="h-8 pl-8"
            aria-label={t("searchPlaceholder")}
          />
        </div>
        <FilterButton value={filters} onChange={setFilters} source={meta} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Chip className="hidden sm:inline-flex">
              <ArrowUpDown />
              {t("sortedBy")}{" "}
              <span className="font-medium text-fg">{t(`order.${options.orderBy.field}`)}</span>
            </Chip>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup
              value={options.orderBy.field}
              onValueChange={(field) =>
                setOptions({ orderBy: { field: field as OrderField, dir: options.orderBy.dir } })
              }
            >
              {ORDER_FIELDS.map((f) => (
                <DropdownMenuRadioItem key={f} value={f}>
                  {t(`order.${f}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip
          content={options.completed === "show" ? t("completedMode.hide") : t("completedMode.show")}
          shortcut="shift+h"
        >
          <Chip
            active={options.completed !== "show"}
            onClick={toggleDone}
            data-testid="done-toggle"
          >
            {options.completed === "show" ? <Eye /> : <EyeOff />}
            {options.completed === "show"
              ? t("doneShown")
              : options.completed === "recent"
                ? t("doneRecent")
                : isPlaceholderData
                  ? t("doneHiddenPending")
                  : t("doneHidden", { count: hidden })}
          </Chip>
        </Tooltip>
      </div>
      <FilterBar value={filters} onChange={setFilters} source={meta} />

      {isEmpty && !search ? (
        <EmptyState
          icon={<ListTodo />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            meta.can.create ? (
              <Button variant="primary" onClick={() => createInGroup(undefined)}>
                <Plus />
                {t("newItem")}
              </Button>
            ) : null
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title={t("emptyFilteredTitle")}
          description={t("emptyFilteredDescription")}
          action={
            filtered ? (
              <Button onClick={() => setFilters(EMPTY_FILTER)}>{tf("clearAll")}</Button>
            ) : null
          }
        />
      ) : options.layout === "TIMELINE" ? (
        <TimelineView
          rows={tableRows}
          meta={meta}
          options={options}
          setOptions={setOptions}
          relations={relations ?? NO_RELATIONS}
          focusedId={focusedId}
          onFocus={setFocusedId}
          onOpen={onOpen}
          onUpdate={onUpdate}
        />
      ) : options.layout === "CALENDAR" ? (
        <CalendarView
          rows={tableRows}
          meta={meta}
          options={options}
          setOptions={setOptions}
          focusedId={focusedId}
          onFocus={setFocusedId}
          onOpen={onOpen}
          onUpdate={onUpdate}
        />
      ) : options.layout === "TABLE" ? (
        <TableView
          rows={tableRows}
          meta={meta}
          options={options}
          setOptions={setOptions}
          selection={selection}
          onToggleSelect={toggleSelect}
          focusedId={focusedId}
          onFocus={setFocusedId}
          onOpen={onOpen}
          onUpdate={onUpdate}
          onOrderChange={onOrderChange}
        />
      ) : options.layout === "BOARD" ? (
        <BoardView
          groups={groups}
          meta={meta}
          options={options}
          hiddenByState={items?.hiddenByState ?? {}}
          onShowDone={() => setOptions({ completed: "show" })}
          onOpen={onOpen}
          onUpdate={onUpdate}
          onMove={(input) => move.mutate(input)}
          onCreateInGroup={createInGroup}
          focusedId={focusedId}
          onFocus={setFocusedId}
        />
      ) : (
        <ListView
          groups={groups}
          meta={meta}
          options={options}
          collapsed={collapsed}
          onToggleGroup={(key) =>
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
          hiddenByState={items?.hiddenByState ?? {}}
          onShowDone={() => setOptions({ completed: "show" })}
          selection={selection}
          onToggleSelect={toggleSelect}
          focusedId={focusedId}
          onFocus={setFocusedId}
          onOpen={onOpen}
          onUpdate={onUpdate}
          onCreateInGroup={createInGroup}
          openPicker={openPicker}
          onPickerChange={setOpenPicker}
          onOrderChange={onOrderChange}
        />
      )}

      {selection.size > 0 ? (
        <SelectionBar
          count={selection.size}
          meta={meta}
          onClear={() => setSelection(new Set())}
          onPatch={(patch) => bulk.mutate({ ids: [...selection], patch })}
          onDelete={() => {
            del.mutate([...selection]);
            setSelection(new Set());
          }}
        />
      ) : null}

      <PeekPanel ws={ws} itemRef={peek} onClose={() => void setPeek(null)} />
      {creating ? (
        <CreateItemDialog
          ws={ws}
          meta={meta}
          open={Boolean(creating)}
          onOpenChange={(o) => !o && setCreating(null)}
          defaults={creating}
        />
      ) : null}
    </div>
  );
}

function DisplayOptionsButton({
  options,
  setOptions,
}: {
  options: DisplayOptions;
  setOptions: (p: Partial<DisplayOptions>) => void;
}) {
  const t = useTranslations("items");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="hidden sm:inline-flex">
          <SlidersHorizontal />
          {t("displayOptions")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex flex-col gap-3 p-4">
          <Field label={t("groupBy")}>
            <Select
              value={options.groupBy}
              options={GROUP_KEYS.map((g) => ({ value: g, label: t(`group.${g}`) }))}
              onChange={(v) => setOptions({ groupBy: v as GroupKey })}
            />
          </Field>
          <Field label={t("orderBy")}>
            <div className="flex gap-1.5">
              <Select
                value={options.orderBy.field}
                options={ORDER_FIELDS.map((f) => ({ value: f, label: t(`order.${f}`) }))}
                onChange={(v) =>
                  setOptions({ orderBy: { field: v as OrderField, dir: options.orderBy.dir } })
                }
              />
              <Button
                size="icon-sm"
                aria-label="Direction"
                disabled={options.orderBy.field === "manual"}
                onClick={() =>
                  setOptions({
                    orderBy: {
                      field: options.orderBy.field,
                      dir: options.orderBy.dir === "asc" ? "desc" : "asc",
                    },
                  })
                }
              >
                <ArrowUpDown className={cn(options.orderBy.dir === "desc" && "rotate-180")} />
              </Button>
            </div>
          </Field>
          <Field label={t("completedItems")}>
            <SegmentedControl
              value={options.completed}
              onValueChange={(v) => setOptions({ completed: v as DisplayOptions["completed"] })}
              label={t("completedItems")}
            >
              {(["hide", "recent", "show"] as const).map((m) => (
                <SegmentedControlItem key={m} value={m}>
                  {t(`completedMode.${m}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </Field>
          <Field label={t("density")}>
            <SegmentedControl
              value={options.density}
              onValueChange={(v) => setOptions({ density: v as DisplayOptions["density"] })}
              label={t("density")}
            >
              <SegmentedControlItem value="comfortable">{t("comfortable")}</SegmentedControlItem>
              <SegmentedControlItem value="compact">{t("compact")}</SegmentedControlItem>
            </SegmentedControl>
          </Field>
          <label className="flex items-center justify-between text-body">
            {t("showSubItems")}
            <Switch
              checked={options.showSubItems}
              onCheckedChange={(v) => setOptions({ showSubItems: v })}
            />
          </label>
          <label className="flex items-center justify-between text-body">
            {t("showEmptyGroups")}
            <Switch
              checked={options.showEmptyGroups}
              onCheckedChange={(v) => setOptions({ showEmptyGroups: v })}
            />
          </label>
        </div>
        <div className="border-t border-border p-4">
          <p className="mb-2 text-small font-medium text-fg-muted">{t("properties")}</p>
          <div className="flex flex-wrap gap-1.5">
            {PROPERTY_KEYS.map((p) => {
              const on = options.properties.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setOptions({
                      properties: on
                        ? options.properties.filter((x) => x !== p)
                        : [...options.properties, p],
                    })
                  }
                  className={cn(
                    "h-7 rounded-chip border px-2 text-small focus-ring transition-colors",
                    on
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : "border-border text-fg-secondary hover:bg-surface-hover",
                  )}
                >
                  {t(`prop.${p}`)}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-body text-fg-secondary">{label}</span>
      {children}
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="min-w-32 justify-between">
          {options.find((o) => o.value === value)?.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectionBar({
  count,
  meta,
  onClear,
  onPatch,
  onDelete,
}: {
  count: number;
  meta: ProjectMeta;
  onClear: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("items");
  return (
    <div
      className="absolute bottom-4 left-1/2 z-[35] flex -translate-x-1/2 items-center gap-1 rounded-card border border-border bg-surface px-2 py-1.5 shadow-dialog"
      role="toolbar"
      aria-label={t("selected", { count })}
    >
      <span className="px-2 text-body font-medium tabular">{t("selected", { count })}</span>
      <span className="h-5 w-px bg-border" />
      {meta.can.edit ? (
        <>
          <StatePicker
            variant="pill"
            meta={meta}
            value={meta.states[0]?.id ?? ""}
            onChange={(stateId) => onPatch({ stateId })}
          />
          <PriorityPicker
            variant="pill"
            value="NONE"
            onChange={(priority) => onPatch({ priority })}
          />
          <AssigneePicker
            meta={meta}
            value={[]}
            onChange={(assigneeIds) => onPatch({ assigneeIds })}
          />
          <LabelPicker meta={meta} value={[]} onChange={(labelIds) => onPatch({ labelIds })} />
        </>
      ) : null}
      {meta.can.delete ? (
        <Tooltip content={t("delete")} shortcut="mod+backspace">
          <Button variant="danger-ghost" size="icon-sm" aria-label={t("delete")} onClick={onDelete}>
            <Trash />
          </Button>
        </Tooltip>
      ) : null}
      <DropdownMenuSeparatorLike />
      <Tooltip content={t("cancel")} shortcut="esc">
        <Button variant="ghost" size="icon-sm" aria-label={t("cancel")} onClick={onClear}>
          <X />
        </Button>
      </Tooltip>
    </div>
  );
}

function DropdownMenuSeparatorLike() {
  return <span className="h-5 w-px bg-border" aria-hidden />;
}
