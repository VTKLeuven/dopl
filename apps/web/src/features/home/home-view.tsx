"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Ellipsis,
  GripVertical,
  House,
  LayoutDashboard,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  addWidget,
  hasWidget,
  moveWidget,
  removeWidget,
  replaceWidget,
  shiftWidget,
  widgetsIn,
} from "@dopl/shared/domain/home";
import {
  HOME_ZONES,
  type HomeLayout,
  type HomeWidget,
  type HomeZone,
} from "@dopl/shared/schemas/home";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/shell/page-header";
import { CaptureComposer } from "@/features/notes/capture";
import { ConvertDialog, type ConvertTarget } from "@/features/notes/convert-dialog";
import { NoteDialog } from "@/features/notes/note-dialog";
import type { HomeLayoutState } from "@/server/queries/home";
import { CONFIGURABLE, WIDGET_ICONS, type HomeCapabilities } from "./catalog";
import { useHomeLayout, useSaveHomeLayout } from "./data";
import { AddWidgetDialog, WidgetSettingsDialog } from "./widget-dialogs";
import { EditChromeProvider, HomeDataProvider, HomeWidgetView, type HomeData } from "./widgets";

/** What the server loads for Home; the page adds the dialogs' callbacks. */
export type HomeServerData = Omit<HomeData, "openNote" | "convert" | "hasPinned">;

/**
 * Home (D-141): a greeting, the capture bar, and the member's widgets in
 * three zones. "Customize" switches to edit mode, where widgets are dragged
 * between zones, configured, added and removed; every change saves at once.
 */
export function HomeView({
  greeting,
  initialLayout,
  caps,
  data,
}: {
  greeting: React.ReactNode;
  initialLayout: HomeLayoutState;
  caps: HomeCapabilities;
  data: HomeServerData;
}) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const { ws, me } = data;
  const { data: state = initialLayout } = useHomeLayout(ws, initialLayout);
  const save = useSaveHomeLayout(ws);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [settingsFor, setSettingsFor] = useState<HomeWidget | null>(null);
  const [convert, setConvert] = useState<ConvertTarget | null>(null);
  const [, setNote] = useQueryState("note");
  const layout = state.layout;

  const home = useMemo<HomeData>(
    () => ({
      ...data,
      hasPinned: hasWidget(layout, "pinnedNotes"),
      openNote: (id) => void setNote(id),
      convert: setConvert,
    }),
    [data, layout, setNote],
  );

  const change = (next: HomeLayout) => save.mutate(next);
  const remove = (widget: HomeWidget) => {
    const before = layout;
    change(removeWidget(layout, widget.id));
    toast(t("edit.removed", { name: t(`widgets.${widget.type}.name`) }), {
      action: { label: tc("undo"), onClick: () => save.mutate(before) },
    });
  };
  const reset = () => {
    const before = state;
    save.mutate(null);
    toast(t("edit.resetDone"), {
      action: before.custom
        ? { label: tc("undo"), onClick: () => save.mutate(before.layout) }
        : undefined,
    });
  };

  const actions = editing ? (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={reset}
        disabled={!state.custom}
        title={t("edit.resetHint")}
        data-testid="home-reset"
      >
        <RotateCcw />
        <span className="max-sm:sr-only">{t("edit.reset")}</span>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setAdding(true)}
        data-testid="home-add-widget"
      >
        <Plus />
        <span className="max-sm:sr-only">{t("edit.addWidget")}</span>
      </Button>
      <Button variant="primary" size="sm" onClick={() => setEditing(false)} data-testid="home-done">
        <Check />
        {t("edit.done")}
      </Button>
    </>
  ) : (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setEditing(true)}
      data-testid="home-customize"
    >
      <LayoutDashboard />
      {t("edit.customize")}
    </Button>
  );

  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), icon: <House /> }]} actions={actions} />
      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-5 py-8 md:px-8">
          {greeting}
          <CaptureComposer ws={ws} me={me} className="w-full" />
          <HomeDataProvider value={home}>
            {editing ? (
              <EditGrid
                layout={layout}
                onChange={change}
                onSettings={setSettingsFor}
                onRemove={remove}
              />
            ) : layout.widgets.length === 0 ? (
              <EmptyState
                icon={<LayoutDashboard />}
                title={t("edit.emptyTitle")}
                description={t("edit.emptyDescription")}
                action={
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditing(true);
                      setAdding(true);
                    }}
                  >
                    <Plus />
                    {t("edit.addWidget")}
                  </Button>
                }
              />
            ) : (
              <ViewGrid layout={layout} />
            )}
          </HomeDataProvider>
        </div>
      </div>
      <AddWidgetDialog
        ws={ws}
        open={adding}
        onOpenChange={setAdding}
        layout={layout}
        caps={caps}
        onAdd={(widget) => {
          change(addWidget(layout, widget));
          setEditing(true);
        }}
      />
      <WidgetSettingsDialog
        ws={ws}
        widget={settingsFor}
        onClose={() => setSettingsFor(null)}
        onSave={(widget) => {
          change(replaceWidget(layout, widget));
          setSettingsFor(null);
        }}
      />
      <ConvertDialog ws={ws} me={me.id} target={convert} onClose={() => setConvert(null)} />
      <NoteDialog ws={ws} me={me} />
    </>
  );
}

/* ───────────────────────── reading ───────────────────────── */

/** Full-width widgets on top, then the main column and the 340 px side column. */
function ViewGrid({ layout }: { layout: HomeLayout }) {
  const top = widgetsIn(layout, "top");
  const main = widgetsIn(layout, "main");
  const side = widgetsIn(layout, "side");
  const list = (widgets: HomeWidget[]) =>
    widgets.map((w) => <HomeWidgetView key={w.id} widget={w} />);
  return (
    <div className="flex flex-col gap-8" data-testid="home-widgets">
      {top.length > 0 ? <div className="flex min-w-0 flex-col gap-8">{list(top)}</div> : null}
      {main.length + side.length > 0 ? (
        <div
          className={cn(
            "grid grid-cols-1 gap-8",
            main.length > 0 && side.length > 0 && "lg:grid-cols-[minmax(0,1fr)_340px]",
          )}
        >
          {main.length > 0 ? <div className="flex min-w-0 flex-col gap-8">{list(main)}</div> : null}
          {side.length > 0 ? (
            <aside className="flex min-w-0 flex-col gap-8">{list(side)}</aside>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── customizing ───────────────────────── */

const zoneId = (zone: HomeZone) => `zone:${zone}`;

function zoneOf(layout: HomeLayout, id: string): HomeZone | null {
  if (id.startsWith("zone:")) return id.slice(5) as HomeZone;
  return layout.widgets.find((w) => w.id === id)?.zone ?? null;
}

interface EditProps {
  layout: HomeLayout;
  onChange: (layout: HomeLayout) => void;
  onSettings: (widget: HomeWidget) => void;
  onRemove: (widget: HomeWidget) => void;
}

/** Where a widget dragged in from another zone will land: before a widget, or at the end. */
type DropMark = { zone: HomeZone; before: string | null } | null;

/**
 * Edit mode: every zone is a sortable list and a drop target. Within a zone
 * the widgets make room as you drag; across zones a line marks where the
 * widget will land, and it moves there on drop (moving it live would remount
 * it mid-drag). The menu offers the same moves for the keyboard.
 */
function EditGrid({ layout, onChange, onSettings, onRemove }: EditProps) {
  const t = useTranslations("home.edit");
  const [mark, setMark] = useState<DropMark>(null);
  const [active, setActive] = useState<HomeWidget | null>(null);
  const stop = () => {
    setMark(null);
    setActive(null);
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The widget under the pointer wins over the zone around it; in a zone's
  // gaps, the nearest widget of that zone. The keyboard has no pointer.
  const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    const widgets = within.filter((c) => !String(c.id).startsWith("zone:"));
    if (widgets.length > 0) return widgets;
    const hit = within.find((c) => String(c.id).startsWith("zone:"));
    if (!hit) return closestCorners(args);
    const z = zoneOf(layout, String(hit.id));
    const inZone = args.droppableContainers.filter(
      (d) => !String(d.id).startsWith("zone:") && zoneOf(layout, String(d.id)) === z,
    );
    return inZone.length > 0 ? closestCenter({ ...args, droppableContainers: inZone }) : [hit];
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    const from = zoneOf(layout, String(active.id));
    const to = over ? zoneOf(layout, String(over.id)) : null;
    const next: DropMark =
      over && to && to !== from
        ? { zone: to, before: String(over.id).startsWith("zone:") ? null : String(over.id) }
        : null;
    setMark((m) => (m?.zone === next?.zone && m?.before === next?.before ? m : next));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    stop();
    const widget = layout.widgets.find((w) => w.id === active.id);
    const zone = over ? zoneOf(layout, String(over.id)) : null;
    if (!widget || !over || !zone) return;
    const list = widgetsIn(layout, zone);
    const index = String(over.id).startsWith("zone:")
      ? list.length - (zone === widget.zone ? 1 : 0)
      : list.findIndex((w) => w.id === over.id);
    if (index < 0) return;
    if (zone === widget.zone && list.findIndex((w) => w.id === widget.id) === index) return;
    onChange(moveWidget(layout, widget.id, zone, index));
  };

  const zone = (z: HomeZone) => (
    <Zone
      key={z}
      zone={z}
      widgets={widgetsIn(layout, z)}
      markEnd={mark?.zone === z && !mark.before}
    >
      {(widget, index, count) => (
        <SortableWidget
          key={widget.id}
          widget={widget}
          first={index === 0}
          last={index === count - 1}
          marked={mark?.before === widget.id}
          layout={layout}
          onChange={onChange}
          onSettings={onSettings}
          onRemove={onRemove}
        />
      )}
    </Zone>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="home-edit">
      <p className="text-small text-fg-muted">{t("hint")}</p>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragOver={onDragOver}
        onDragStart={({ active }) =>
          setActive(layout.widgets.find((w) => w.id === active.id) ?? null)
        }
        onDragEnd={onDragEnd}
        onDragCancel={stop}
      >
        <div className="flex flex-col gap-6">
          {zone("top")}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            {zone("main")}
            {zone("side")}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? <DragChip widget={active} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/** Widgets make room only for a widget dragged within their own zone. */
const zoneStrategy: SortingStrategy = (args) =>
  args.overIndex < 0 ? null : verticalListSortingStrategy(args);

/** What follows the pointer while dragging: the widget's name, not the whole widget. */
function DragChip({ widget }: { widget: HomeWidget }) {
  const t = useTranslations("home");
  const Icon = WIDGET_ICONS[widget.type];
  return (
    <div className="inline-flex cursor-grabbing items-center gap-2 rounded-card border border-sky-300 bg-surface px-3 py-2 text-body font-semibold shadow-drag">
      <GripVertical className="size-4 text-icon" aria-hidden />
      <Icon className="size-4 text-icon" aria-hidden />
      {widget.type === "taggedNotes" ? `#${widget.tag}` : t(`widgets.${widget.type}.name`)}
    </div>
  );
}

/** The drop line between widgets; absolutely placed so it never shifts the layout. */
function DropLine({ at }: { at: "top" | "bottom" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-sky-500",
        at === "top" ? "-top-[9px]" : "-bottom-[9px]",
      )}
    />
  );
}

function Zone({
  zone,
  widgets,
  markEnd,
  children,
}: {
  zone: HomeZone;
  widgets: HomeWidget[];
  markEnd: boolean;
  children: (widget: HomeWidget, index: number, count: number) => React.ReactNode;
}) {
  const t = useTranslations("home");
  const { setNodeRef } = useDroppable({ id: zoneId(zone) });
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-caption font-medium text-fg-muted uppercase">{t(`zones.${zone}`)}</span>
      <SortableContext items={widgets.map((w) => w.id)} strategy={zoneStrategy}>
        <div
          ref={setNodeRef}
          data-testid={`zone-${zone}`}
          className={cn(
            "relative flex min-w-0 flex-col gap-4 rounded-card transition-colors duration-[var(--dur-fast)]",
            widgets.length === 0 &&
              "min-h-20 items-center justify-center border border-dashed border-border-strong",
            markEnd && widgets.length === 0 && "border-sky-300 bg-sky-50",
          )}
        >
          {widgets.length === 0 ? (
            <p className="px-4 text-center text-small text-fg-muted">{t("edit.dropHere")}</p>
          ) : (
            widgets.map((w, i) => children(w, i, widgets.length))
          )}
          {markEnd && widgets.length > 0 ? <DropLine at="bottom" /> : null}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableWidget({
  widget,
  first,
  last,
  marked,
  layout,
  onChange,
  onSettings,
  onRemove,
}: EditProps & { widget: HomeWidget; first: boolean; last: boolean; marked: boolean }) {
  const t = useTranslations("home");
  const name = t(`widgets.${widget.type}.name`);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const handle = (
    <Tooltip content={t("edit.drag")}>
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={t("edit.dragLabel", { name })}
        data-testid="widget-handle"
        className="-ml-1 inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-[6px] text-icon focus-ring hover:bg-neutral-150 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
    </Tooltip>
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("edit.menu", { name })}
          data-testid="widget-menu"
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CONFIGURABLE.has(widget.type) ? (
          <DropdownMenuItem onSelect={() => onSettings(widget)}>
            <Settings2 />
            {t("edit.settings")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={first}
          onSelect={() => onChange(shiftWidget(layout, widget.id, -1))}
        >
          <ArrowUp />
          {t("edit.moveUp")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={last}
          onSelect={() => onChange(shiftWidget(layout, widget.id, 1))}
        >
          <ArrowDown />
          {t("edit.moveDown")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("edit.moveTo")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={widget.zone}
              onValueChange={(z) =>
                onChange(moveWidget(layout, widget.id, z as HomeZone, Number.POSITIVE_INFINITY))
              }
            >
              {HOME_ZONES.map((z) => (
                <DropdownMenuRadioItem key={z} value={z} data-testid={`move-to-${z}`}>
                  {t(`zones.${z}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => onRemove(widget)}>
          <Trash2 />
          {t("edit.remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative min-w-0", isDragging && "opacity-40")}
    >
      {marked ? <DropLine at="top" /> : null}
      <EditChromeProvider value={{ handle, menu }}>
        <HomeWidgetView widget={widget} />
      </EditChromeProvider>
    </div>
  );
}
