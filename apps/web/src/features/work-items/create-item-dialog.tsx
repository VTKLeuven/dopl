"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ListPlus } from "lucide-react";
import type { Priority } from "@dopl/shared/schemas/work-item";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Shortcut } from "@/components/ui/kbd";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { ProjectBadge } from "@/components/shell/project-badge";
import { useCreateItems } from "./data";
import { useEditorSources } from "./editor-sources";
import { AssigneePicker, DatePicker, LabelPicker, PriorityPicker, StatePicker, TypePicker } from "./pickers";
import type { ProjectMeta } from "./types";

export interface CreateDefaults {
  stateId?: string;
  priority?: Priority;
  assigneeIds?: string[];
  labelIds?: string[];
  typeId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
}

export function CreateItemDialog({
  ws,
  meta,
  open,
  onOpenChange,
  defaults,
}: {
  ws: string;
  meta: ProjectMeta;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: CreateDefaults;
}) {
  const t = useTranslations("items");
  const router = useRouter();
  const create = useCreateItems(ws, meta.project.id);
  const sources = useEditorSources(ws, meta);
  const initialState = () => defaults.stateId ?? meta.states.find((s) => s.isDefault)?.id ?? meta.states[0]?.id ?? "";
  // The parent mounts this dialog fresh on every open, so state starts from `defaults`.
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<string[] | null>(null);
  const [description, setDescription] = useState<unknown>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [stateId, setStateId] = useState(initialState);
  const [priority, setPriority] = useState<Priority>(defaults.priority ?? "NONE");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(defaults.assigneeIds ?? []);
  const [labelIds, setLabelIds] = useState<string[]>(defaults.labelIds ?? []);
  const [typeId, setTypeId] = useState<string | null>(defaults.typeId ?? meta.types.find((x) => x.isDefault)?.id ?? null);
  const [dueDate, setDueDate] = useState<string | null>(defaults.dueDate ?? null);
  const [more, setMore] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const titles = lines ?? (title.trim() ? [title.trim()] : []);

  async function submit(keepOpen: boolean) {
    if (titles.length === 0 || create.isPending) return;
    const shared = {
      stateId,
      priority,
      assigneeIds,
      labelIds,
      typeId,
      dueDate,
      parentId: defaults.parentId ?? null,
      ...(titles.length === 1 && description ? { description } : {}),
    };
    const created = await create.mutateAsync({ titles, shared }).catch(() => null);
    if (!created) return;
    const first = created[0];
    if (created.length === 1 && first) {
      toast.success(t("created", { identifier: first.identifier }), {
        action: { label: t("openFull"), onClick: () => router.push(`/${ws}/i/${first.identifier}` as never) },
      });
    } else {
      toast.success(t("createdMany", { count: created.length }));
    }
    if (keepOpen || more) {
      setTitle("");
      setLines(null);
      setDescription(null);
      setEditorKey((k) => k + 1);
      titleRef.current?.focus();
    } else {
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="top-[10vh]" onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          void submit(e.shiftKey);
        }
      }}>
        <div className="flex items-center gap-2 px-5 pt-4 text-small text-fg-muted">
          <ProjectBadge name={meta.project.name} color={meta.project.color} size={16} />
          <span>{meta.project.name}</span>
          <span aria-hidden>›</span>
          <DialogTitle className="text-small font-medium text-fg">{t("createTitle")}</DialogTitle>
        </div>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pb-3 pt-3">
          {lines ? (
            <div className="rounded-control border border-sky-200 bg-sky-50 px-3 py-2">
              <p className="flex items-center gap-2 text-body font-medium text-sky-800">
                <ListPlus className="size-4" />
                {t("pasteDetected", { count: lines.length })}
              </p>
              <ol className="mt-1.5 max-h-40 list-decimal overflow-y-auto pl-6 text-body text-fg-secondary">
                {lines.map((l, i) => (
                  <li key={i} className="truncate">{l}</li>
                ))}
              </ol>
              <Button variant="link" size="xs" className="mt-1" onClick={() => { setTitle(lines.join(" ")); setLines(null); }}>
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <input
              ref={titleRef}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text/plain");
                const pasted = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean);
                if (pasted.length > 1) {
                  e.preventDefault();
                  setLines(pasted.slice(0, 100));
                }
              }}
              placeholder={t("titlePlaceholder")}
              aria-label={t("titlePlaceholder")}
              className="w-full bg-transparent text-title-lg font-semibold text-fg outline-none placeholder:text-fg-placeholder"
            />
          )}
          {!lines ? (
            <RichTextEditor key={editorKey} value={null} onChange={setDescription} placeholder={t("descriptionPlaceholder")} sources={sources} minHeight="min-h-[96px]" />
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <StatePicker variant="pill" meta={meta} value={stateId} onChange={setStateId} />
            <PriorityPicker variant="pill" value={priority} onChange={setPriority} />
            <span className="inline-flex h-6 items-center rounded-[7px] border border-border px-0.5">
              <AssigneePicker meta={meta} value={assigneeIds} onChange={setAssigneeIds} />
            </span>
            <LabelPicker meta={meta} value={labelIds} onChange={setLabelIds} max={3} />
            <TypePicker variant="pill" meta={meta} value={typeId} onChange={setTypeId} />
            <DatePicker variant="pill" label={t("setDue")} value={dueDate} onChange={setDueDate} />
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <label className="flex items-center gap-2 text-small text-fg-secondary">
            <Switch checked={more} onCheckedChange={setMore} />
            {t("createAndContinue")}
          </label>
          <span className="ml-auto hidden text-small text-fg-muted sm:inline-flex">
            <Shortcut keys="mod+enter" />
          </span>
          <Button variant="primary" onClick={() => void submit(false)} loading={create.isPending} disabled={titles.length === 0}>
            {titles.length > 1 ? t("createMany", { count: titles.length }) : t("create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
