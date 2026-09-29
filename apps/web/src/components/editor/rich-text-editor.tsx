"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { cn } from "@/lib/cn";
import { suggestionRenderer } from "./suggestion";
import type { SuggestionItem } from "./suggestion-list";

export interface EditorSources {
  /** @mentions: people (and the AI teammate) */
  people: (query: string) => SuggestionItem[] | Promise<SuggestionItem[]>;
  /** #references: work items */
  items?: (query: string) => SuggestionItem[] | Promise<SuggestionItem[]>;
  emptyLabel: string;
}

export const proseClasses = cn(
  "text-body leading-[22px] text-fg",
  "[&_p]:my-0 [&_p+p]:mt-2 [&_h1]:mb-1 [&_h1]:mt-4 [&_h1]:text-title-lg [&_h1]:font-semibold [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-title [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-nav [&_h3]:font-semibold",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0.5 [&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-start [&_li[data-type=taskItem]]:gap-2 [&_li[data-type=taskItem]>label]:mt-[3px] [&_li[data-checked=true]>div]:text-fg-muted [&_li[data-checked=true]>div]:line-through",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-secondary",
  "[&_code]:rounded-[5px] [&_code]:bg-neutral-150 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-small",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_a]:text-link [&_a]:underline-offset-2 hover:[&_a]:underline [&_hr]:my-3 [&_hr]:border-border",
  "[&_.mention]:rounded-[5px] [&_.mention]:bg-lavender-50 [&_.mention]:px-1 [&_.mention]:font-medium [&_.mention]:text-lavender-800",
  "[&_.item-ref]:rounded-[5px] [&_.item-ref]:border [&_.item-ref]:border-border [&_.item-ref]:bg-surface-muted [&_.item-ref]:px-1 [&_.item-ref]:font-medium [&_.item-ref]:text-fg-secondary [&_.item-ref]:tabular-nums",
);

export function RichTextEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  sources,
  className,
  autoFocus,
  editable = true,
  onReady,
  minHeight = "min-h-[72px]",
}: {
  value: unknown;
  onChange?: (doc: unknown, editor: Editor) => void;
  /** ⌘/Ctrl+Enter */
  onSubmit?: () => void;
  placeholder?: string;
  sources: EditorSources;
  className?: string;
  autoFocus?: boolean;
  editable?: boolean;
  onReady?: (editor: Editor) => void;
  minHeight?: string;
}) {
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  }, [onSubmit]);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    autofocus: autoFocus ? "end" : false,
    content: (value as object | null) ?? "",
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"], HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
        emptyEditorClass:
          "before:pointer-events-none before:float-left before:h-0 before:text-fg-placeholder before:content-[attr(data-placeholder)]",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        renderText: ({ node }) => `@${String(node.attrs.label ?? node.attrs.id)}`,
        renderHTML: ({ node, options }) => ["span", options.HTMLAttributes, `@${String(node.attrs.label ?? node.attrs.id)}`],
        suggestion: {
          char: "@",
          items: ({ query }) => sources.people(query),
          render: suggestionRenderer(sources.emptyLabel),
        },
      }),
      ...(sources.items
        ? [
            Mention.extend({ name: "workItemRef" }).configure({
              HTMLAttributes: { class: "item-ref" },
              renderText: ({ node }) => String(node.attrs.label ?? ""),
              renderHTML: ({ node, options }) => ["span", options.HTMLAttributes, String(node.attrs.label ?? "")],
              suggestion: {
                char: "#",
                items: ({ query }) => sources.items?.(query) ?? [],
                render: suggestionRenderer(sources.emptyLabel),
              },
            }),
          ]
        : []),
    ],
    editorProps: {
      attributes: { class: cn(proseClasses, "outline-none", minHeight) },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && submitRef.current) {
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON(), e),
    onCreate: ({ editor: e }) => onReady?.(e),
  });

  return <EditorContent editor={editor} className={cn("cursor-text", className)} />;
}
