"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BarChart3,
  ChevronDown,
  Copy,
  Ellipsis,
  FolderKanban,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { PROJECT_DASHBOARD, WORKSPACE_DASHBOARD } from "@dopl/shared/domain/dashboards";
import { RANGES, type Range } from "@dopl/shared/schemas/analytics";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { ProjectBadge } from "@/components/shell/project-badge";
import { useProjects } from "@/features/notes/data";
import { ChartBuilder, type BuilderTarget } from "./chart-builder";
import { useDashboard, useDashboardMutations, useWidgetMutations } from "./data";
import type { DashboardDetail, WidgetView } from "./types";
import { SPAN, WidgetCard, type WidgetActions } from "./widget-card";

const rangeParser = parseAsStringLiteral(RANGES).withDefault("90d");

/** The filter row every chart on the page shares (dataviz: filters above the charts, not in them). */
function useDashboardFilters() {
  const [range, setRange] = useQueryState("range", rangeParser);
  const [project, setProject] = useQueryState("project", parseAsString);
  return { range, setRange, project, setProject };
}

function FilterRow({
  ws,
  range,
  onRange,
  project,
  onProject,
  showProject,
}: {
  ws: string;
  range: Range;
  onRange: (r: Range) => void;
  project: string | null;
  onProject: (p: string | null) => void;
  showProject: boolean;
}) {
  const t = useTranslations("analytics");
  const { data: projects = [] } = useProjects(ws, showProject);
  const current = projects.find((p) => p.id === project);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="dashboard-filters">
      <SegmentedControl
        label={t("range.label")}
        value={range}
        onValueChange={(v) => onRange(v as Range)}
      >
        {RANGES.map((r) => (
          <SegmentedControlItem key={r} value={r} data-testid={`range-${r}`}>
            {t(`range.${r}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {showProject ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" data-testid="dashboard-project">
              {current ? (
                <ProjectBadge name={current.name} color={current.color} size={16} />
              ) : (
                <FolderKanban />
              )}
              {current?.name ?? t("project.all")}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            <DropdownMenuRadioGroup
              value={project ?? "all"}
              onValueChange={(v) => onProject(v === "all" ? null : v)}
            >
              <DropdownMenuRadioItem value="all">{t("project.all")}</DropdownMenuRadioItem>
              {projects.map((p) => (
                <DropdownMenuRadioItem key={p.id} value={p.id}>
                  <ProjectBadge name={p.name} color={p.color} size={16} />
                  {p.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/** The grid: 12 columns from `md`, one column on phones. */
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-12 gap-4" data-testid="dashboard-grid">
      {children}
    </div>
  );
}

/* ───────────────────────── built-in dashboards ───────────────────────── */

/**
 * The overview for the workspace or one project (ROADMAP §Phase 6.3). It's
 * defined in code, so it's read-only; "Duplicate" makes an editable copy.
 */
export function BuiltInDashboard({
  ws,
  projectId,
  title,
}: {
  ws: string;
  /** Set on a project's analytics page. */
  projectId: string | null;
  title: string;
}) {
  const t = useTranslations("analytics");
  const router = useRouter();
  const filters = useDashboardFilters();
  const { create } = useDashboardMutations(ws);
  const widgets = projectId ? PROJECT_DASHBOARD : WORKSPACE_DASHBOARD;
  const scope = projectId ?? filters.project;

  const duplicate = () =>
    create.mutate(
      {
        name: t("copyName", { name: title }),
        projectId,
        fromDefault: projectId ? "project" : "workspace",
        titles: Object.fromEntries(widgets.map((w) => [w.key, t(`default.${w.key}`)])),
      },
      { onSuccess: ({ id }) => router.push(`/${ws}/analytics/${id}` as never) },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterRow
          ws={ws}
          range={filters.range}
          onRange={(r) => void filters.setRange(r)}
          project={filters.project}
          onProject={(p) => void filters.setProject(p)}
          showProject={!projectId}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={duplicate}
          loading={create.isPending}
          title={t("duplicateHint")}
          data-testid="duplicate-dashboard"
        >
          <Copy />
          {t("duplicate")}
        </Button>
      </div>
      <Grid>
        {widgets.map((w) => (
          <WidgetCard
            key={w.key}
            ws={ws}
            title={t(`default.${w.key}`)}
            spec={w.spec}
            w={w.w}
            range={filters.range}
            projectId={scope}
          />
        ))}
      </Grid>
    </div>
  );
}

/* ───────────────────────── custom dashboards ───────────────────────── */

export function CustomDashboard({
  ws,
  id,
  initial,
}: {
  ws: string;
  id: string;
  initial: DashboardDetail;
}) {
  const t = useTranslations("analytics");
  const router = useRouter();
  const filters = useDashboardFilters();
  const { data: dashboard = initial } = useDashboard(ws, id, initial);
  const widgetsApi = useWidgetMutations(ws, id);
  const dashboards = useDashboardMutations(ws);
  const [builder, setBuilder] = useState<BuilderTarget | null>(null);
  const [renaming, setRenaming] = useState(false);
  const editable = dashboard.canEdit;
  const scope = dashboard.projectId ?? filters.project;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const list = dashboard.widgets;
    const from = list.findIndex((w) => w.id === active.id);
    const to = list.findIndex((w) => w.id === over.id);
    if (from < 0 || to < 0) return;
    const rest = list.filter((w) => w.id !== active.id);
    // Keys of the new neighbours once the widget sits at index `to`.
    const before = rest[to - 1]?.key ?? null;
    const after = rest[to]?.key ?? null;
    widgetsApi.move.mutate({ id: String(active.id), before, after });
  };

  const actionsFor = (w: WidgetView): WidgetActions | undefined =>
    editable
      ? {
          onEdit: () => setBuilder({ dashboardId: id, widget: w }),
          onResize: (size) => widgetsApi.resize.mutate({ id: w.id, w: size }),
          onRemove: () => widgetsApi.remove.mutate(w.id),
        }
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterRow
          ws={ws}
          range={filters.range}
          onRange={(r) => void filters.setRange(r)}
          project={filters.project}
          onProject={(p) => void filters.setProject(p)}
          showProject={!dashboard.projectId}
        />
        <div className="flex items-center gap-2">
          {editable ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label={t("widget.more")}
                    data-testid="dashboard-menu"
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>
                    <Pencil />
                    {t("rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      dashboards.update.mutate({
                        id,
                        visibility: dashboard.visibility === "WORKSPACE" ? "PRIVATE" : "WORKSPACE",
                      })
                    }
                    data-testid="dashboard-share"
                  >
                    {dashboard.visibility === "WORKSPACE" ? <Lock /> : <Users />}
                    {dashboard.visibility === "WORKSPACE" ? t("unshare") : t("share")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    onSelect={() =>
                      dashboards.remove.mutate(id, {
                        onSuccess: () => router.push(`/${ws}/analytics` as never),
                      })
                    }
                  >
                    <Trash2 />
                    {t("deleteDashboard")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setBuilder({ dashboardId: id })}
                data-testid="add-chart"
              >
                <Plus />
                {t("addChart")}
              </Button>
            </>
          ) : (
            <p className="text-small text-fg-muted">
              {t("readOnly", { name: dashboard.owner.name })}
            </p>
          )}
        </div>
      </div>

      {dashboard.widgets.length === 0 ? (
        <EmptyState
          icon={<BarChart3 />}
          title={t("addChart")}
          description={t("noDashboards")}
          action={
            editable ? (
              <Button variant="primary" onClick={() => setBuilder({ dashboardId: id })}>
                <Plus />
                {t("addChart")}
              </Button>
            ) : undefined
          }
        />
      ) : editable ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={dashboard.widgets.map((w) => w.id)}
            strategy={rectSortingStrategy}
          >
            <Grid>
              {dashboard.widgets.map((w) => (
                <SortableWidget
                  key={w.id}
                  ws={ws}
                  widget={w}
                  range={filters.range}
                  projectId={scope}
                  actions={actionsFor(w)}
                />
              ))}
            </Grid>
          </SortableContext>
        </DndContext>
      ) : (
        <Grid>
          {dashboard.widgets.map((w) => (
            <WidgetCard
              key={w.id}
              ws={ws}
              title={w.title}
              spec={w.spec}
              w={w.w}
              range={filters.range}
              projectId={scope}
            />
          ))}
        </Grid>
      )}

      <ChartBuilder
        ws={ws}
        target={builder}
        range={filters.range}
        projectId={scope}
        onClose={() => setBuilder(null)}
      />
      <RenameDialog
        open={renaming}
        name={dashboard.name}
        onClose={() => setRenaming(false)}
        onSave={(name) =>
          dashboards.update.mutate({ id, name }, { onSuccess: () => setRenaming(false) })
        }
      />
    </div>
  );
}

function SortableWidget({
  ws,
  widget,
  range,
  projectId,
  actions,
}: {
  ws: string;
  widget: WidgetView;
  range: Range;
  projectId: string | null;
  actions?: WidgetActions;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // The wrapper takes the span; the card fills it.
      className={cn("col-span-12", SPAN[widget.w], isDragging && "z-10")}
    >
      <WidgetCard
        ws={ws}
        title={widget.title}
        spec={widget.spec}
        w={12}
        range={range}
        projectId={projectId}
        dragging={isDragging}
        className="h-full"
        actions={actions ? { ...actions, handle: { ...attributes, ...listeners } } : undefined}
      />
    </div>
  );
}

function RenameDialog({
  open,
  name,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const t = useTranslations("analytics");
  const [value, setValue] = useState(name);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setValue(name);
        else onClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t("rename")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={120}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) onSave(value.trim());
            }}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("builder.cancel")}
          </Button>
          <Button variant="primary" disabled={!value.trim()} onClick={() => onSave(value.trim())}>
            {t("rename")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
