"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNodeType } from "@tiptap/pm/model";
import { Hash } from "lucide-react";
import { findTagTokens, isUnderTag, newBlockId, normalizeTagPath } from "@dopl/shared/domain/notes";
import { cn } from "@/lib/cn";
import { proseClasses } from "@/components/editor/rich-text-editor";
import { suggestionRenderer } from "@/components/editor/suggestion";
import type { SuggestionItem } from "@/components/editor/suggestion-list";
import { StateIcon } from "@/components/icons/state-icon";
import type { SearchHit } from "@/features/work-items/data";
import { noteKeys } from "./data";
import type { TagRow } from "./types";

/** Prose plus the inline #tag highlight used in the editor and on cards. */
export const noteProseClasses = cn(
  proseClasses,
  "[&_.note-tag]:rounded-[5px] [&_.note-tag]:bg-sky-50 [&_.note-tag]:px-0.5 [&_.note-tag]:font-medium [&_.note-tag]:text-sky-700",
  "[&_li[data-type=taskItem]>div]:min-w-0 [&_li[data-type=taskItem]>div]:flex-1",
);

/**
 * Task items carry a stable `blockId` (D-022): new items get one, splits don't
 * copy it, and duplicates (paste) are re-issued. The server re-checks.
 */
const BlockTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      blockId: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-block-id"),
        renderHTML: (attrs: Record<string, unknown>) =>
          typeof attrs.blockId === "string" ? { "data-block-id": attrs.blockId } : {},
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey("taskBlockIds"),
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((tr) => tr.docChanged)) return null;
          const seen = new Set<string>();
          let tr: Transaction | null = null;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "taskItem") return true;
            const id: unknown = node.attrs.blockId;
            if (typeof id === "string" && id && !seen.has(id)) {
              seen.add(id);
              return true;
            }
            const fresh = newBlockId();
            seen.add(fresh);
            tr = (tr ?? state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, blockId: fresh });
            return true;
          });
          return tr;
        },
      }),
    ];
  },
});

/** Highlights #tags as you type (same rules as the server's parser). */
function tagDecorations(doc: PMNodeType): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false;
    if (!node.isTextblock) return true;
    let text = "";
    const at: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText && !child.marks.some((m) => m.type.name === "code")) {
        const s = child.text ?? "";
        for (let i = 0; i < s.length; i++) at.push(start + i);
        text += s;
      } else {
        at.push(start);
        text += " ";
      }
    });
    for (const t of findTagTokens(text)) {
      const from = at[t.start];
      const to = at[t.end - 1];
      if (from !== undefined && to !== undefined)
        decos.push(Decoration.inline(from, to + 1, { class: "note-tag" }));
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}

const HashtagHighlight = Extension.create({
  name: "hashtagHighlight",
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("hashtagHighlight");
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => tagDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? tagDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});

export interface NoteEditorProps {
  ws: string;
  value: unknown;
  onChange?: (doc: unknown, editor: Editor) => void;
  /** ⌘/Ctrl+Enter */
  onSubmit?: () => void;
  /** Esc, unless a suggestion popup took it. */
  onEscape?: () => void;
  onReady?: (editor: Editor) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  minHeight?: string;
  ariaLabel?: string;
}

/**
 * The notes editor: markdown shortcuts (StarterKit input rules, `[ ]` for a
 * checkbox), `#` completes existing tags or links a work item, and every task
 * line gets a stable block id.
 */
export function NoteEditor({
  ws,
  value,
  onChange,
  onSubmit,
  onEscape,
  onReady,
  placeholder,
  autoFocus,
  className,
  minHeight = "min-h-[72px]",
  ariaLabel,
}: NoteEditorProps) {
  const t = useTranslations("notes");
  const qc = useQueryClient();
  const handlers = useRef({ onChange, onSubmit, onEscape });
  useEffect(() => {
    handlers.current = { onChange, onSubmit, onEscape };
  }, [onChange, onSubmit, onEscape]);
  const suggesting = useRef(false);

  const extensions = useMemo(() => {
    const base = suggestionRenderer(t("editor.noMatches"));
    const render: typeof base = () => {
      const r = base?.();
      return {
        ...r,
        onStart: (p) => {
          suggesting.current = true;
          r?.onStart?.(p);
        },
        onExit: (p) => {
          suggesting.current = false;
          r?.onExit?.(p);
        },
      };
    };
    const items = async (query: string): Promise<SuggestionItem[]> => {
      const q = query.toLowerCase();
      const tags = qc.getQueryData<TagRow[]>(noteKeys.tags(ws)) ?? [];
      const matches = tags
        .filter((tag) => !q || tag.path.includes(q) || isUnderTag(tag.path, q))
        .slice(0, 6)
        .map((tag) => ({
          id: `tag:${tag.path}`,
          label: `#${tag.path}`,
          icon: <Hash className="size-3.5 text-icon" />,
        }));
      const fresh = normalizeTagPath(query);
      const out: SuggestionItem[] = [];
      if (fresh && !tags.some((tag) => tag.path === fresh))
        out.push({
          id: `tag:${fresh}`,
          label: `#${fresh}`,
          hint: t("editor.newTag"),
          icon: <Hash className="size-3.5 text-icon" />,
        });
      out.push(...matches);
      if (query.length > 0) {
        const res = await fetch(`/api/v1/${ws}/search/items?q=${encodeURIComponent(query)}`).catch(
          () => null,
        );
        if (res?.ok) {
          const hits = (await res.json()) as SearchHit[];
          out.push(
            ...hits.slice(0, 5).map((h) => ({
              id: h.id,
              label: h.identifier,
              hint: h.title.slice(0, 40),
              icon: <StateIcon group={h.stateGroup} size={14} />,
            })),
          );
        }
      }
      return out;
    };
    return [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
        emptyEditorClass:
          "before:pointer-events-none before:float-left before:h-0 before:text-fg-placeholder before:content-[attr(data-placeholder)]",
      }),
      TaskList,
      BlockTaskItem.configure({ nested: true }),
      HashtagHighlight,
      Mention.extend({ name: "workItemRef" }).configure({
        HTMLAttributes: { class: "item-ref" },
        renderText: ({ node }) => String(node.attrs.label ?? ""),
        renderHTML: ({ node, options }) => [
          "span",
          options.HTMLAttributes,
          String(node.attrs.label ?? ""),
        ],
        suggestion: {
          char: "#",
          items: ({ query }) => items(query),
          render,
          // Tags are plain text (`#infra/proxmox `); items become #INFRA-n chips.
          command: ({ editor, range, props }) => {
            const item = props as SuggestionItem;
            const after = editor.view.state.selection.$to.nodeAfter;
            if (after?.text?.startsWith(" ")) range.to += 1;
            editor
              .chain()
              .focus()
              .insertContentAt(
                range,
                item.id.startsWith("tag:")
                  ? [{ type: "text", text: `#${item.id.slice(4)} ` }]
                  : [
                      { type: "workItemRef", attrs: { id: item.id, label: item.label } },
                      { type: "text", text: " " },
                    ],
              )
              .run();
          },
        },
      }),
    ];
    // The editor is created once; handlers are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    content: (value as object | null) ?? "",
    extensions,
    editorProps: {
      attributes: {
        class: cn(noteProseClasses, "outline-none", minHeight),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        role: "textbox",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && handlers.current.onSubmit) {
          handlers.current.onSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => handlers.current.onChange?.(e.getJSON(), e),
    onCreate: ({ editor: e }) => onReady?.(e),
  });

  return (
    <EditorContent
      editor={editor}
      className={cn("cursor-text", className)}
      data-testid="note-editor"
      onKeyDown={(e) => {
        // A suggestion popup handles its own Escape (and prevents the default).
        if (e.key === "Escape" && !e.defaultPrevented && !suggesting.current) {
          handlers.current.onEscape?.();
        }
      }}
    />
  );
}

/** True while a `#` suggestion popup is open in any note editor (dialogs keep Esc for it). */
export function suggestionOpen(): boolean {
  return Boolean(document.querySelector("body > div > [role=listbox]"));
}
