"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, FolderKanban } from "lucide-react";
import { noteTitle } from "@dopl/shared/domain/notes";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectBadge } from "@/components/shell/project-badge";
import { Picker } from "@/features/work-items/pickers";
import { useConvert, useProjects } from "./data";
import type { NoteCard } from "./types";

export type ConvertTarget =
  | { kind: "note"; noteId: string; text: string; fromReview?: boolean }
  | { kind: "todo"; noteId: string; blockId: string; text: string };

/** Target for converting a whole note (title from its first line). */
export const noteTarget = (card: NoteCard, fromReview?: boolean): ConvertTarget => ({
  kind: "note",
  noteId: card.id,
  text: noteTitle(card.contentText, 300),
  fromReview,
});

const LAST_PROJECT = "dopl.notes.convertProject";

function lastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT);
  } catch {
    return null;
  }
}

/** Project picker + title, then one transaction on the server (item + link back). */
export function ConvertDialog({
  ws,
  me,
  target,
  onClose,
  onConverted,
}: {
  ws: string;
  me: string;
  target: ConvertTarget | null;
  onClose: () => void;
  onConverted?: () => void;
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      {target ? (
        <ConvertForm
          key={target.kind === "todo" ? target.blockId : target.noteId}
          ws={ws}
          me={me}
          target={target}
          onClose={onClose}
          onConverted={onConverted}
        />
      ) : null}
    </Dialog>
  );
}

function ConvertForm({
  ws,
  me,
  target,
  onClose,
  onConverted,
}: {
  ws: string;
  me: string;
  target: ConvertTarget;
  onClose: () => void;
  onConverted?: () => void;
}) {
  const t = useTranslations("notes.convert");
  const { data: projects = [] } = useProjects(ws);
  const convert = useConvert(ws, me);
  const [title, setTitle] = useState(target.text);
  const [projectId, setProjectId] = useState<string | null>(() => lastProject());
  const project = projects.find((p) => p.id === projectId) ?? null;

  const submit = () => {
    if (!project || !title.trim()) return;
    try {
      localStorage.setItem(LAST_PROJECT, project.id);
    } catch {
      // Private mode: fine, we just won't remember the project.
    }
    const base = { noteId: target.noteId, projectId: project.id, title: title.trim() };
    convert.mutate(
      target.kind === "todo"
        ? { kind: "todo", ...base, blockId: target.blockId }
        : { kind: "note", ...base, fromReview: target.fromReview },
      {
        onSuccess: () => {
          onClose();
          onConverted?.();
        },
      },
    );
  };

  return (
    <DialogContent size="sm" data-testid="convert-dialog">
      <DialogHeader>
        <DialogTitle>{target.kind === "todo" ? t("lineTitle") : t("noteTitle")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-fg-secondary">{t("titleLabel")}</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            autoFocus
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-fg-secondary">{t("projectLabel")}</span>
          <Picker
            placeholder={t("projectPlaceholder")}
            options={projects.map((p) => ({
              value: p.id,
              label: p.name,
              keywords: [p.identifier],
              icon: <ProjectBadge name={p.name} color={p.color} size={16} />,
            }))}
            selected={projectId ? [projectId] : []}
            onChange={([v]) => setProjectId(v ?? null)}
            trigger={
              <Button variant="secondary" className="justify-start" data-testid="convert-project">
                {project ? (
                  <ProjectBadge name={project.name} color={project.color} size={16} />
                ) : (
                  <FolderKanban />
                )}
                <span className="min-w-0 flex-1 truncate text-left">
                  {project?.name ?? t("projectPlaceholder")}
                </span>
                <ChevronDown />
              </Button>
            }
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={!project || !title.trim()}
          loading={convert.isPending}
        >
          {t("submit")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
