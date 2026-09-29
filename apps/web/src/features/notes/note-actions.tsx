"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Ban, Check, FolderKanban, Lock, Palette, SquareStack, Users } from "lucide-react";
import { tagColors, type TagColor } from "@dopl/shared/palette";
import type { NoteSharing } from "@dopl/shared/schemas/notes";
import { cn } from "@/lib/cn";
import { tagClass } from "@/lib/palette";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StateIcon } from "@/components/icons/state-icon";
import { ProjectBadge } from "@/components/shell/project-badge";
import { useItemSearch } from "@/features/work-items/data";
import { useProjects } from "./data";
import type { NoteCard } from "./types";

/** Card surface per colour token (bg-50 / border-200, DESIGN_SYSTEM §3.4). */
const CARD_SURFACE: Record<TagColor, string> = {
  purple: "bg-tag-purple-bg border-tag-purple-border",
  red: "bg-tag-red-bg border-tag-red-border",
  green: "bg-tag-green-bg border-tag-green-border",
  lime: "bg-tag-lime-bg border-tag-lime-border",
  blue: "bg-tag-blue-bg border-tag-blue-border",
  amber: "bg-tag-amber-bg border-tag-amber-border",
  pink: "bg-tag-pink-bg border-tag-pink-border",
  teal: "bg-tag-teal-bg border-tag-teal-border",
  orange: "bg-tag-orange-bg border-tag-orange-border",
  grey: "bg-tag-grey-bg border-tag-grey-border",
};

export function cardColorClass(color: TagColor | null): string {
  return color ? CARD_SURFACE[color] : "bg-surface border-border";
}

export function ColorSwatches({
  value,
  onChange,
}: {
  value: TagColor | null;
  onChange: (c: TagColor | null) => void;
}) {
  const t = useTranslations("notes.color");
  return (
    <div className="grid grid-cols-6 gap-1.5 p-2" role="radiogroup" aria-label={t("label")}>
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        aria-label={t("none")}
        onClick={() => onChange(null)}
        className="inline-flex size-7 items-center justify-center rounded-full border border-border-strong bg-surface focus-ring"
      >
        {value === null ? (
          <Check className="size-3.5 text-fg" />
        ) : (
          <Ban className="size-3.5 text-icon" />
        )}
      </button>
      {tagColors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={t(c)}
          onClick={() => onChange(c)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-full border focus-ring",
            tagClass(c).pill,
          )}
        >
          {value === c ? <Check className="size-3.5" /> : null}
        </button>
      ))}
    </div>
  );
}

export function ColorButton({
  value,
  onChange,
  size = "icon-xs",
}: {
  value: TagColor | null;
  onChange: (c: TagColor | null) => void;
  size?: "icon-xs" | "icon-sm";
}) {
  const t = useTranslations("notes.color");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={t("label")}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size={size}
            aria-label={t("label")}
            onClick={(e) => e.stopPropagation()}
          >
            <Palette />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent onClick={(e) => e.stopPropagation()} className="w-auto">
        <ColorSwatches
          value={value}
          onChange={(c) => {
            onChange(c);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function currentSharing(card: NoteCard): NoteSharing["kind"] {
  if (card.workItem) return "workItem";
  if (card.project) return "project";
  return card.visibility === "WORKSPACE" ? "workspace" : "private";
}

/** Menu entries for who can see a note (the owner's ⋯ menu). */
export function ShareMenuItems({
  ws,
  card,
  onShare,
  onPickItem,
}: {
  ws: string;
  card: NoteCard;
  onShare: (sharing: NoteSharing) => void;
  onPickItem: () => void;
}) {
  const t = useTranslations("notes.share");
  const { data: projects = [] } = useProjects(ws);
  const kind = currentSharing(card);
  const mark = (on: boolean) => (on ? <Check className="ml-auto text-sky-600!" /> : null);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="note-share">
        <Users />
        {t("menu")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        <DropdownMenuItem onSelect={() => onShare({ kind: "private" })}>
          <Lock />
          {t("private")}
          {mark(kind === "private")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onShare({ kind: "workspace" })}>
          <Users />
          {t("workspace")}
          {mark(kind === "workspace")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderKanban />
            {card.project ? t("projectNamed", { name: card.project.name }) : t("project")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => onShare({ kind: "project", projectId: p.id })}
              >
                <ProjectBadge name={p.name} color={p.color} size={16} />
                <span className="truncate">{p.name}</span>
                {mark(card.project?.id === p.id)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={onPickItem}>
          <SquareStack />
          {card.workItem ? t("itemNamed", { identifier: card.workItem.identifier }) : t("item")}
          {mark(kind === "workItem")}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Search for a work item to attach a note to. */
export function AttachItemDialog({
  ws,
  open,
  onClose,
  onPick,
}: {
  ws: string;
  open: boolean;
  onClose: () => void;
  onPick: (workItemId: string) => void;
}) {
  const t = useTranslations("notes.share");
  const [q, setQ] = useState("");
  const { data: hits = [] } = useItemSearch(ws, q, undefined, open);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md" hideClose className="overflow-hidden p-0">
        <DialogTitle className="sr-only">{t("item")}</DialogTitle>
        <Command shouldFilter={false} loop>
          <CommandInput
            placeholder={t("itemPlaceholder")}
            value={q}
            onValueChange={setQ}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>{t("noItems")}</CommandEmpty>
            {hits.map((h) => (
              <CommandItem
                key={h.id}
                value={h.id}
                onSelect={() => {
                  onPick(h.id);
                  onClose();
                }}
              >
                <StateIcon group={h.stateGroup} />
                <span className="w-20 shrink-0 text-small text-fg-muted tabular">
                  {h.identifier}
                </span>
                <span className="truncate">{h.title}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
