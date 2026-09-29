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

/**
 * Read-only renderer for sanitized Tiptap JSON → React elements.
 * No HTML strings, so nothing can inject markup (D-019, CLAUDE.md security rules).
 */
export function RichTextView({ doc, className }: { doc: unknown; className?: string }) {
  if (!doc || typeof doc !== "object") return null;
  return <div className={cn(proseClasses, className)}>{renderNodes((doc as Node).content)}</div>;
}

function renderNodes(nodes: Node[] | undefined): React.ReactNode {
  return nodes?.map((n, i) => <Fragment key={i}>{renderNode(n)}</Fragment>);
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

function renderNode(n: Node): React.ReactNode {
  switch (n.type) {
    case "text":
      return renderText(n);
    case "paragraph":
      return <p>{renderNodes(n.content)}</p>;
    case "heading": {
      const level = Number(n.attrs?.level ?? 2);
      return level === 1 ? (
        <h1>{renderNodes(n.content)}</h1>
      ) : level === 2 ? (
        <h2>{renderNodes(n.content)}</h2>
      ) : (
        <h3>{renderNodes(n.content)}</h3>
      );
    }
    case "bulletList":
      return <ul>{renderNodes(n.content)}</ul>;
    case "orderedList":
      return <ol start={Number(n.attrs?.start ?? 1)}>{renderNodes(n.content)}</ol>;
    case "listItem":
      return <li>{renderNodes(n.content)}</li>;
    case "taskList":
      return <ul data-type="taskList">{renderNodes(n.content)}</ul>;
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
          <div>{renderNodes(n.content)}</div>
        </li>
      );
    case "blockquote":
      return <blockquote>{renderNodes(n.content)}</blockquote>;
    case "codeBlock":
      return (
        <pre>
          <code>{renderNodes(n.content)}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr />;
    case "hardBreak":
      return <br />;
    case "mention":
      return <span className="mention">@{String(n.attrs?.label ?? "")}</span>;
    case "workItemRef":
      return (
        <span className="item-ref">{String(n.attrs?.identifier ?? n.attrs?.label ?? "")}</span>
      );
    default:
      return renderNodes(n.content);
  }
}
