import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { proseClasses } from "./rich-text-editor";

interface Node {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

/** Renders a `#INFRA-42` node (chat shows it as a chip with state and title). */
export type ItemRefRenderer = (attrs: { id: string; label: string }) => React.ReactNode;

/**
 * Read-only renderer for sanitized Tiptap JSON → React elements.
 * No HTML strings, so nothing can inject markup (D-019, CLAUDE.md security rules).
 */
export function RichTextView({
  doc,
  className,
  renderItemRef,
}: {
  doc: unknown;
  className?: string;
  renderItemRef?: ItemRefRenderer;
}) {
  if (!doc || typeof doc !== "object") return null;
  return (
    <div className={cn(proseClasses, className)}>
      {renderNodes((doc as Node).content, renderItemRef)}
    </div>
  );
}

function renderNodes(nodes: Node[] | undefined, itemRef?: ItemRefRenderer): React.ReactNode {
  return nodes?.map((n, i) => <Fragment key={i}>{renderNode(n, itemRef)}</Fragment>);
}

function renderText(n: Node): React.ReactNode {
  let el: React.ReactNode = n.text ?? "";
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
    ) {
      el = (
        <a href={m.attrs.href} target="_blank" rel="noopener noreferrer nofollow">
          {el}
        </a>
      );
    }
  }
  return el;
}

function renderNode(n: Node, itemRef?: ItemRefRenderer): React.ReactNode {
  const children = (nodes: Node[] | undefined) => renderNodes(nodes, itemRef);
  switch (n.type) {
    case "text":
      return renderText(n);
    case "paragraph":
      return <p>{children(n.content)}</p>;
    case "heading": {
      const level = Number(n.attrs?.level ?? 2);
      return level === 1 ? (
        <h1>{children(n.content)}</h1>
      ) : level === 2 ? (
        <h2>{children(n.content)}</h2>
      ) : (
        <h3>{children(n.content)}</h3>
      );
    }
    case "bulletList":
      return <ul>{children(n.content)}</ul>;
    case "orderedList":
      return <ol start={Number(n.attrs?.start ?? 1)}>{children(n.content)}</ol>;
    case "listItem":
      return <li>{children(n.content)}</li>;
    case "taskList":
      return <ul data-type="taskList">{children(n.content)}</ul>;
    case "taskItem":
      return (
        <li data-type="taskItem" data-checked={n.attrs?.checked ? "true" : "false"}>
          <label>
            <input
              type="checkbox"
              checked={Boolean(n.attrs?.checked)}
              readOnly
              className="accent-sky-600"
            />
          </label>
          <div>{children(n.content)}</div>
        </li>
      );
    case "blockquote":
      return <blockquote>{children(n.content)}</blockquote>;
    case "codeBlock":
      return (
        <pre>
          <code>{children(n.content)}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr />;
    case "hardBreak":
      return <br />;
    case "mention":
      return <span className="mention">@{String(n.attrs?.label ?? "")}</span>;
    case "workItemRef":
      if (itemRef && typeof n.attrs?.id === "string")
        return itemRef({
          id: n.attrs.id,
          label: String(n.attrs.identifier ?? n.attrs.label ?? ""),
        });
      return (
        <span className="item-ref">{String(n.attrs?.identifier ?? n.attrs?.label ?? "")}</span>
      );
    default:
      return children(n.content);
  }
}
