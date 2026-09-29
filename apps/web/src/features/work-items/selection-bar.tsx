"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Archive, FolderInput, Trash, X } from "lucide-react";
import type { PaletteData } from "@/server/queries/palette";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { ProjectBadge } from "@/components/shell/project-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AssigneePicker,
  DatePicker,
  LabelPicker,
  PriorityPicker,
  StatePicker,
  TypePicker,
} from "./pickers";
import type { ProjectMeta, WorkItemRow } from "./types";

/**
 * Floating bar for the selection (DESIGN_SYSTEM §5): every change is one batch
 * with an undo toast. State is offered only when all rows share a project,
 * because each project has its own states.
 */
export function SelectionBar({
  ws,
  rows,
  meta,
  onClear,
  onPatch,
  onArchive,
  onDelete,
  onMove,
}: {
  ws: string;
  rows: WorkItemRow[];
  meta: ProjectMeta;
  onClear: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onArchive: () => void;
  onDelete: () => void;
  onMove: (projectId: string) => void;
}) {
  const t = useTranslations("items");
  // The bar's pickers start empty; what you pick is applied to every row.
  const [assignees, setAssignees] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const projectIds = new Set(rows.map((r) => r.projectId));
  const sameProject = projectIds.size === 1;
  const firstState = sameProject ? rows[0]?.stateId : undefined;
  const { data: palette } = useQuery({
    queryKey: ["palette", ws],
    queryFn: async () => {
      const res = await fetch(`/api/v1/${ws}/palette`, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as PaletteData;
    },
    staleTime: 30_000,
  });
  const targets = (palette?.projects ?? []).filter((p) => !(sameProject && projectIds.has(p.id)));

  return (
    <div
      className="absolute bottom-4 left-1/2 z-[35] flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-card border border-border bg-surface px-2 py-1.5 shadow-dialog"
      role="toolbar"
      aria-label={t("selected", { count: rows.length })}
      data-testid="selection-bar"
      data-reveal
    >
      <span className="px-2 text-body font-medium whitespace-nowrap tabular">
        {t("selected", { count: rows.length })}
      </span>
      <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
      {meta.can.edit ? (
        <>
          {firstState ? (
            <StatePicker
              variant="pill"
              meta={meta}
              value={firstState}
              onChange={(stateId) => onPatch({ stateId })}
            />
          ) : null}
          <PriorityPicker
            variant="pill"
            value="NONE"
            onChange={(priority) => onPatch({ priority })}
          />
          <AssigneePicker
            meta={meta}
            value={assignees}
            onChange={(assigneeIds) => {
              setAssignees(assigneeIds);
              onPatch({ assigneeIds });
            }}
          />
          <LabelPicker
            meta={meta}
            value={labels}
            projectId={sameProject ? rows[0]?.projectId : undefined}
            onChange={(labelIds) => {
              setLabels(labelIds);
              onPatch({ labelIds });
            }}
          />
          <TypePicker
            variant="icon"
            meta={meta}
            value={null}
            onChange={(typeId) => onPatch({ typeId })}
          />
          <DatePicker
            variant="icon"
            label={t("setDue")}
            value={null}
            highlightOverdue={false}
            onChange={(dueDate) => onPatch({ dueDate })}
          />
          {targets.length ? (
            <DropdownMenu>
              <Tooltip content={t("moveTo")}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("moveTo")}
                    data-testid="bulk-move"
                  >
                    <FolderInput />
                  </Button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent align="center" side="top" className="max-h-72 overflow-y-auto">
                <DropdownMenuLabel>{t("moveTo")}</DropdownMenuLabel>
                {targets.map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => onMove(p.id)}>
                    <ProjectBadge name={p.name} color={p.color} size={16} />
                    {p.name}
                    <span className="ml-auto text-small text-fg-muted tabular">{p.identifier}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Tooltip content={t("archive")}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("archive")}
              onClick={onArchive}
              data-testid="bulk-archive"
            >
              <Archive />
            </Button>
          </Tooltip>
        </>
      ) : null}
      {meta.can.delete ? (
        <Tooltip content={t("delete")} shortcut="mod+backspace">
          <Button variant="danger-ghost" size="icon-sm" aria-label={t("delete")} onClick={onDelete}>
            <Trash />
          </Button>
        </Tooltip>
      ) : null}
      <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
      <Tooltip content={t("cancel")} shortcut="esc">
        <Button variant="ghost" size="icon-sm" aria-label={t("cancel")} onClick={onClear}>
          <X />
        </Button>
      </Tooltip>
    </div>
  );
}
