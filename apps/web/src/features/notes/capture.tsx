"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import { ListChecks, Pin, PinOff, StickyNote } from "lucide-react";
import type { TagColor } from "@dopl/shared/palette";
import { extractTodos } from "@dopl/shared/domain/notes";
import { isEmptyDoc, type PMNode } from "@dopl/shared/rich-text";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Shortcut } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { newNoteId, useCreateNote } from "./data";
import { editorJson, NoteEditor } from "./note-editor";
import { cardColorClass, ColorButton } from "./note-actions";

export interface Me {
  id: string;
  name: string;
  image: string | null;
}

/**
 * Quick capture (PROMPT §4.6): write, ⌘Enter, done. The card appears in the
 * grid immediately (optimistic) and the editor is ready for the next note.
 */
export function CaptureComposer({
  ws,
  me,
  variant = "bar",
  onSaved,
  onCancel,
  autoFocus = false,
  className,
}: {
  ws: string;
  me: Me;
  variant?: "bar" | "dialog";
  onSaved?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const t = useTranslations("notes.capture");
  const create = useCreateNote(ws, me);
  const editorRef = useRef<Editor | null>(null);
  const [expanded, setExpanded] = useState(variant === "dialog" || autoFocus);
  const [color, setColor] = useState<TagColor | null>(null);
  const [pinned, setPinned] = useState(false);
  const [empty, setEmpty] = useState(true);

  const reset = () => {
    editorRef.current?.commands.clearContent(true);
    setColor(null);
    setPinned(false);
    setEmpty(true);
  };

  const save = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const content = editorJson(editor);
    const doc = content;
    if (isEmptyDoc(doc) && extractTodos(doc).length === 0) return;
    create.mutate({ clientId: newNoteId(), content, color, pinned });
    reset();
    if (variant === "dialog") {
      toast(t("saved"));
      onSaved?.();
    } else {
      editor.commands.focus();
      onSaved?.();
    }
  };

  const collapse = () => {
    if (variant === "dialog") onCancel?.();
    else if (empty) setExpanded(false);
    else editorRef.current?.commands.blur();
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        data-testid="capture-bar"
        className={cn(
          "flex h-12 w-full items-center gap-2.5 rounded-card border border-border bg-surface px-4 text-left text-body text-fg-placeholder shadow-card",
          "focus-ring transition-shadow duration-[var(--dur-fast)] hover:shadow-popover",
          className,
        )}
      >
        <StickyNote className="size-4 text-icon" aria-hidden />
        <span className="flex-1">{t("placeholder")}</span>
        <Shortcut keys="q" />
      </button>
    );
  }

  return (
    <div
      data-testid="capture-composer"
      className={cn(
        "flex flex-col rounded-card border",
        variant === "bar" && "shadow-popover",
        variant === "dialog" ? "border-0" : cardColorClass(color),
        variant === "bar" && !color && "border-border-strong",
        className,
      )}
    >
      <div className="px-4 pt-3.5 pb-2">
        <NoteEditor
          ws={ws}
          value={null}
          autoFocus
          ariaLabel={t("label")}
          placeholder={t("editorPlaceholder")}
          minHeight={variant === "dialog" ? "min-h-[140px]" : "min-h-[60px]"}
          onReady={(e) => {
            editorRef.current = e;
          }}
          onChange={(doc) => {
            const d = doc as PMNode;
            setEmpty(isEmptyDoc(d) && extractTodos(d).length === 0);
          }}
          onSubmit={save}
          onEscape={collapse}
        />
      </div>
      <div className="flex items-center gap-0.5 border-t border-border/70 px-2 py-1.5">
        <Tooltip content={t("checklist")}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("checklist")}
            onClick={() => editorRef.current?.chain().focus().toggleTaskList().run()}
          >
            <ListChecks />
          </Button>
        </Tooltip>
        <ColorButton value={color} onChange={setColor} size="icon-sm" />
        <Tooltip content={pinned ? t("unpin") : t("pin")}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={pinned ? t("unpin") : t("pin")}
            aria-pressed={pinned}
            onClick={() => setPinned((p) => !p)}
          >
            {pinned ? <PinOff /> : <Pin />}
          </Button>
        </Tooltip>
        <span className="ml-2 hidden text-caption text-fg-muted sm:inline">{t("hint")}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              collapse();
              if (variant === "bar") setExpanded(false);
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            disabled={empty}
            data-testid="capture-save"
          >
            {t("save")}
            <Shortcut keys="mod+enter" tone="inverted" />
          </Button>
        </div>
      </div>
    </div>
  );
}
