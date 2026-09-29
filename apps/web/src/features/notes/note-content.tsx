"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SquareArrowOutUpRight } from "lucide-react";
import { findTagTokens } from "@dopl/shared/domain/notes";
import type { PMNode } from "@dopl/shared/rich-text";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import { noteProseClasses } from "./note-editor";

export interface ContentActions {
  ws: string;
  /** Toggle a checkbox in place (matched by blockId). */
  onToggle?: (blockId: string, checked: boolean) => void;
  /** Turn a checkbox line into a work item. */
  onConvertLine?: (blockId: string, text: string) => void;
  onTag?: (path: string) => void;
}

/**
 * Read-only note renderer for cards: sanitized JSON → React (no HTML strings),
 * with live checkboxes, clickable #tags and #INFRA-n chips.
 */
export function NoteContent({
  doc,
  className,
  ...actions
}: { doc: unknown; className?: string } & ContentActions) {
  if (!doc || typeof doc !== "object") return null;
  return (
    <div className={cn(noteProseClasses, className)}>
      <Nodes nodes={(doc as PMNode).content} a={actions} />
    </div>
  );
}

function Nodes({ nodes, a }: { nodes: PMNode[] | undefined; a: ContentActions }) {
  return nodes?.map((n, i) => (
    <Fragment key={i}>
      <NodeView n={n} a={a} />
    </Fragment>
  ));
}

function marked(n: PMNode, el: React.ReactNode): React.ReactNode {
  for (const m of n.marks ?? []) {
    if (m.type === "bold") el = <strong>{el}</strong>;
    else if (m.type === "italic") el = <em>{el}</em>;
    else if (m.type === "strike") el = <s>{el}</s>;
    else if (m.type === "underline") el = <u>{el}</u>;
    else if (m.type === "code") el = <code>{el}</code>;
    else if (
      m.type === "link" &&
      typeof m.attrs?.href === "string" &&
      /^(https?:|mailto:)/.test(m.attrs.href)
    )
      el = (
        <a
          href={m.attrs.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(e) => e.stopPropagation()}
        >
          {el}
        </a>
      );
  }
  return el;
}

/** Text with #tag tokens as buttons (code keeps its text as-is). */
function TextView({ n, a }: { n: PMNode; a: ContentActions }) {
  const text = n.text ?? "";
  if (n.marks?.some((m) => m.type === "code")) return marked(n, text);
  const tokens = findTagTokens(text);
  if (tokens.length === 0) return marked(n, text);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const t of tokens) {
    if (t.start > last) parts.push(text.slice(last, t.start));
    parts.push(
      a.onTag ? (
        <button
          key={t.start}
          type="button"
          className="note-tag focus-ring"
          onClick={(e) => {
            e.stopPropagation();
            a.onTag?.(t.path);
          }}
        >
          {text.slice(t.start, t.end)}
        </button>
      ) : (
        <span key={t.start} className="note-tag">
          {text.slice(t.start, t.end)}
        </span>
      ),
    );
    last = t.end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return marked(n, <>{parts}</>);
}

function TaskItemView({ n, a }: { n: PMNode; a: ContentActions }) {
  const t = useTranslations("notes");
  const blockId = typeof n.attrs?.blockId === "string" ? n.attrs.blockId : null;
  const checked = Boolean(n.attrs?.checked);
  const first = n.content?.find((c) => c.type === "paragraph");
  const label = (first?.content ?? []).map((c) => c.text ?? c.attrs?.label ?? "").join("");
  const converted = first?.content?.some((c) => c.type === "workItemRef") ?? false;
  return (
    <li
      data-type="taskItem"
      data-checked={checked ? "true" : "false"}
      data-block-id={blockId ?? undefined}
      className="group/task"
    >
      <label className="flex" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          disabled={!a.onToggle || !blockId}
          aria-label={label || t("todo")}
          onCheckedChange={(v) => blockId && a.onToggle?.(blockId, v === true)}
        />
      </label>
      <div>
        <Nodes nodes={n.content} a={a} />
      </div>
      {a.onConvertLine && blockId && !converted && label.trim() ? (
        <Tooltip content={t("convertLine")}>
          <button
            type="button"
            aria-label={t("convertLine")}
            onClick={(e) => {
              e.stopPropagation();
              a.onConvertLine?.(blockId, label.trim());
            }}
            className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] text-icon opacity-0 focus-ring transition-opacity group-hover/task:opacity-100 hover:bg-neutral-150 hover:text-fg focus-visible:opacity-100"
          >
            <SquareArrowOutUpRight className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}
    </li>
  );
}

function NodeView({ n, a }: { n: PMNode; a: ContentActions }): React.ReactNode {
  switch (n.type) {
    case "text":
      return <TextView n={n} a={a} />;
    case "paragraph":
      return (
        <p>
          <Nodes nodes={n.content} a={a} />
        </p>
      );
    case "heading": {
      const level = Number(n.attrs?.level ?? 2);
      const inner = <Nodes nodes={n.content} a={a} />;
      return level === 1 ? <h1>{inner}</h1> : level === 2 ? <h2>{inner}</h2> : <h3>{inner}</h3>;
    }
    case "bulletList":
      return (
        <ul>
          <Nodes nodes={n.content} a={a} />
        </ul>
      );
    case "orderedList":
      return (
        <ol start={Number(n.attrs?.start ?? 1)}>
          <Nodes nodes={n.content} a={a} />
        </ol>
      );
    case "listItem":
      return (
        <li>
          <Nodes nodes={n.content} a={a} />
        </li>
      );
    case "taskList":
      return (
        <ul data-type="taskList">
          <Nodes nodes={n.content} a={a} />
        </ul>
      );
    case "taskItem":
      return <TaskItemView n={n} a={a} />;
    case "blockquote":
      return (
        <blockquote>
          <Nodes nodes={n.content} a={a} />
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre>
          <code>{(n.content ?? []).map((c) => c.text ?? "").join("")}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr />;
    case "hardBreak":
      return <br />;
    case "mention":
      return <span className="mention">@{String(n.attrs?.label ?? "")}</span>;
    case "workItemRef": {
      const identifier = String(n.attrs?.identifier ?? n.attrs?.label ?? "");
      return (
        <Link
          href={`/${a.ws}/i/${identifier}` as never}
          className="item-ref focus-ring hover:border-border-strong"
          onClick={(e) => e.stopPropagation()}
          data-testid="note-item-ref"
        >
          {identifier}
        </Link>
      );
    }
    default:
      return <Nodes nodes={n.content} a={a} />;
  }
}
