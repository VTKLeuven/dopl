"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Archive,
  ArchiveRestore,
  Ellipsis,
  ListChecks,
  Pin,
  PinOff,
  RotateCcw,
  SquareArrowOutUpRight,
  SquareStack,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { StateIcon } from "@/components/icons/state-icon";
import { ProjectBadge } from "@/components/shell/project-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNoteLifecycle, useToggleTodo, useUpdateNote, type NotePatch } from "./data";
import { NoteContent } from "./note-content";
import { NoteEditor } from "./note-editor";
import { AttachItemDialog, cardColorClass, ColorButton, ShareMenuItems } from "./note-actions";
import { ConvertDialog, noteTarget, type ConvertTarget } from "./convert-dialog";
import type { NoteCard } from "./types";

const SAVE_DEBOUNCE_MS = 700;

/** Autosave for an editor: debounced while typing, flushed on blur/close/unmount. */
function useAutosave(save: (content: unknown) => void) {
  const pending = useRef<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      const content = pending.current;
      pending.current = null;
      saveRef.current(content);
    }
  };
  const change = (content: unknown) => {
    pending.current = content;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };
  useEffect(() => flush, []);
  return { change, flush };
}

function useOverflows<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  return { ref, overflows };
}

export interface NoteCardProps {
  ws: string;
  me: { id: string; name: string; image: string | null };
  card: NoteCard;
  /** grid: masonry card; dialog: full height, opens in edit mode; compact: Home; review: full height. */
  variant?: "grid" | "dialog" | "compact" | "review";
  onTag?: (path: string) => void;
  /** Read-only cards (shared notes) open here instead of editing in place. */
  onOpen?: (id: string) => void;
  canConvert?: boolean;
}

export function NoteCardView({
  ws,
  me,
  card,
  variant = "grid",
  onTag,
  onOpen,
  canConvert = true,
}: NoteCardProps) {
  const t = useTranslations("notes");
  const relative = useRelativeTime();
  const update = useUpdateNote(ws, me.id);
  const life = useNoteLifecycle(ws, me.id);
  const toggle = useToggleTodo(ws, me.id);
  const [editing, setEditing] = useState(variant === "dialog" && card.canEdit && !card.deletedAt);
  const [convert, setConvert] = useState<ConvertTarget | null>(null);
  const [attach, setAttach] = useState(false);
  const cardRef = useRef(card);
  useEffect(() => {
    cardRef.current = card;
  }, [card]);
  const patch = (p: NotePatch) => update.mutate({ card: cardRef.current, patch: p });
  const autosave = useAutosave((content) => patch({ content }));
  const clamp = (variant === "grid" || variant === "compact") && !editing;
  const { ref: bodyRef, overflows } = useOverflows<HTMLDivElement>(clamp);

  const trashed = Boolean(card.deletedAt);
  const editable = card.canEdit && !trashed;
  const startEdit = () => {
    if (editable) setEditing(true);
    else onOpen?.(card.id);
  };
  const stopEdit = () => {
    autosave.flush();
    if (variant !== "dialog") setEditing(false);
  };

  return (
    <article
      data-testid="note-card"
      data-note-id={card.id}
      aria-label={t("cardLabel")}
      tabIndex={editing ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget && !editing) {
          e.preventDefault();
          startEdit();
        }
      }}
      onBlur={(e) => {
        if (editing && !e.currentTarget.contains(e.relatedTarget as Node | null)) stopEdit();
      }}
      className={cn(
        "group/card relative flex break-inside-avoid flex-col rounded-card border text-left shadow-card outline-none",
        "transition-[box-shadow,border-color] duration-[var(--dur-fast)] ease-out",
        variant === "grid" && "mb-3",
        variant === "dialog" && "border-0 shadow-none",
        cardColorClass(card.color),
        editing && variant !== "dialog" && "border-sky-300 ring-[3px] ring-sky-400/25",
        !editing && "hover:shadow-popover focus-visible:ring-[3px] focus-visible:ring-sky-400/30",
      )}
    >
      {card.pinnedAt && !trashed && variant !== "dialog" ? (
        <Pin
          aria-label={t("pinned")}
          className="absolute top-3 right-3 size-3.5 rotate-45 text-icon transition-opacity group-focus-within/card:opacity-0 group-hover/card:opacity-0"
        />
      ) : null}

      {editing ? (
        <div className={cn("px-4 pt-3.5 pb-1", variant === "dialog" && "px-5 pt-5")}>
          <NoteEditor
            ws={ws}
            value={card.content}
            autoFocus
            ariaLabel={t("editorLabel")}
            placeholder={t("editorPlaceholder")}
            minHeight={variant === "dialog" ? "min-h-[200px]" : "min-h-[44px]"}
            onChange={autosave.change}
            onSubmit={stopEdit}
            onEscape={stopEdit}
          />
        </div>
      ) : (
        <div
          ref={bodyRef}
          onClick={startEdit}
          className={cn(
            "px-4 pt-3.5 pb-1",
            editable || onOpen ? "cursor-text" : "cursor-default",
            clamp && (variant === "compact" ? "max-h-[160px]" : "max-h-[420px]"),
            clamp && "overflow-hidden",
            clamp && overflows && "fade-bottom",
            variant === "dialog" && "px-5 pt-5",
          )}
        >
          <NoteContent
            doc={card.content}
            ws={ws}
            onTag={onTag}
            onToggle={
              editable
                ? (blockId, checked) => toggle.mutate({ noteId: card.id, blockId, checked })
                : undefined
            }
            onConvertLine={
              editable && canConvert && card.canShare
                ? (blockId, text) => setConvert({ kind: "todo", noteId: card.id, blockId, text })
                : undefined
            }
          />
        </div>
      )}

      <CardFooter
        ws={ws}
        card={card}
        me={me.id}
        when={relative(trashed ? (card.deletedAt ?? card.updatedAt) : card.updatedAt)}
      />

      {card.canEdit ? (
        <div
          className={cn(
            "absolute flex items-center gap-0.5 rounded-[9px] p-0.5",
            variant === "dialog" ? "top-3 right-12 opacity-100!" : "top-2 right-2",
            "opacity-0 transition-opacity duration-[var(--dur-fast)] group-focus-within/card:opacity-100 group-hover/card:opacity-100 has-[[data-state=open]]:opacity-100",
            cardColorClass(card.color),
            "border-0",
          )}
        >
          {trashed ? (
            <>
              <Tooltip content={t("restore")}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("restore")}
                  onClick={() => void life.restore(card)}
                >
                  <RotateCcw />
                </Button>
              </Tooltip>
              <Tooltip content={t("purge")}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("purge")}
                  onClick={() => void life.purge(card)}
                >
                  <Trash2 className="text-danger-text!" />
                </Button>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip content={card.pinnedAt ? t("unpin") : t("pin")}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={card.pinnedAt ? t("unpin") : t("pin")}
                  aria-pressed={Boolean(card.pinnedAt)}
                  onClick={(e) => {
                    e.stopPropagation();
                    patch({ pinned: !card.pinnedAt });
                  }}
                >
                  {card.pinnedAt ? <PinOff /> : <Pin />}
                </Button>
              </Tooltip>
              <ColorButton value={card.color} onChange={(color) => patch({ color })} />
              <DropdownMenu>
                <Tooltip content={t("more")}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("more")}
                      data-testid="note-menu"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {card.canShare ? (
                    <>
                      <ShareMenuItems
                        ws={ws}
                        card={card}
                        onShare={(sharing) => patch({ sharing })}
                        onPickItem={() => setAttach(true)}
                      />
                      {canConvert ? (
                        <DropdownMenuItem
                          onSelect={() => setConvert(noteTarget(card))}
                          data-testid="note-convert"
                        >
                          <SquareArrowOutUpRight />
                          {t("convertNote")}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  {card.archivedAt ? (
                    <DropdownMenuItem onSelect={() => void life.unarchive(card)}>
                      <ArchiveRestore />
                      {t("unarchive")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => void life.archive(card)}>
                      <Archive />
                      {t("archive")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem destructive onSelect={() => void life.trash(card)}>
                    <Trash2 />
                    {t("trash")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      ) : null}

      <ConvertDialog ws={ws} me={me.id} target={convert} onClose={() => setConvert(null)} />
      <AttachItemDialog
        ws={ws}
        open={attach}
        onClose={() => setAttach(false)}
        onPick={(workItemId) => patch({ sharing: { kind: "workItem", workItemId } })}
      />
    </article>
  );
}

function CardFooter({
  ws,
  card,
  me,
  when,
}: {
  ws: string;
  card: NoteCard;
  me: string;
  when: string;
}) {
  const t = useTranslations("notes");
  const mine = card.owner.id === me;
  return (
    <footer className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pt-1 pb-3 text-caption text-fg-muted">
      {!mine ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-fg-secondary">
          <Avatar user={card.owner} size="xs" />
          {card.owner.name}
        </span>
      ) : null}
      {card.workItem ? (
        <Link
          href={`/${ws}/i/${card.workItem.identifier}` as never}
          className="inline-flex items-center gap-1 hover:text-fg"
          title={card.workItem.title}
        >
          <SquareStack className="size-3.5" />
          <span className="tabular">{card.workItem.identifier}</span>
        </Link>
      ) : card.project ? (
        <span className="inline-flex items-center gap-1">
          <ProjectBadge name={card.project.name} color={card.project.color} size={14} />
          {card.project.name}
        </span>
      ) : card.visibility === "WORKSPACE" ? (
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" />
          {t("share.team")}
        </span>
      ) : null}
      {card.todoCount > 0 ? (
        <span className="inline-flex items-center gap-1 tabular" title={t("todoProgressTitle")}>
          <ListChecks className="size-3.5" />
          {t("todoProgress", {
            done: card.todoCount - card.openTodoCount,
            total: card.todoCount,
          })}
        </span>
      ) : null}
      {card.convertedTo ? (
        <Link
          href={`/${ws}/i/${card.convertedTo.identifier}` as never}
          className="inline-flex h-5 items-center gap-1 rounded-[6px] border border-border bg-surface px-1.5 font-medium text-fg-secondary tabular hover:border-border-strong"
          title={card.convertedTo.title}
        >
          <StateIcon group={card.convertedTo.stateGroup} size={12} />
          {card.convertedTo.identifier}
        </Link>
      ) : null}
      {card.archivedAt && !card.deletedAt ? (
        <span className="inline-flex items-center gap-1">
          <Archive className="size-3.5" />
          {t("archived")}
        </span>
      ) : null}
      <time dateTime={card.updatedAt} className="ml-auto shrink-0 tabular">
        {when}
      </time>
    </footer>
  );
}
