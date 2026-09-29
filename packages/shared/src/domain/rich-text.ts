/**
 * Tiptap/ProseMirror JSON helpers (D-019). Content from clients is untrusted:
 * `sanitizeDoc` keeps only allowlisted nodes/marks/attrs, so rendering it can
 * never produce script or unexpected HTML.
 */

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

const BLOCKS = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
]);
const INLINE = new Set(["text", "mention", "workItemRef"]);
const MARKS = new Set(["bold", "italic", "strike", "code", "underline", "link"]);

const ALLOWED_ATTRS: Record<string, string[]> = {
  heading: ["level"],
  taskItem: ["checked", "blockId"],
  orderedList: ["start"],
  codeBlock: ["language"],
  mention: ["id", "label", "kind"],
  workItemRef: ["id", "identifier", "label"],
};

function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  try {
    const u = new URL(href);
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeNode(node: unknown, depth: number): PMNode[] {
  if (!node || typeof node !== "object" || depth > 30) return [];
  const n = node as PMNode;
  if (typeof n.type !== "string") return [];

  if (n.type === "text") {
    if (typeof n.text !== "string" || n.text.length === 0) return [];
    const rawMarks: unknown[] = Array.isArray(n.marks) ? n.marks : [];
    const marks = rawMarks
      .filter(
        (m): m is { type: string; attrs?: Record<string, unknown> } =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as { type?: unknown }).type === "string" &&
          MARKS.has((m as { type: string }).type),
      )
      .map((m) => {
        if (m.type !== "link") return { type: m.type };
        const href = safeHref(m.attrs?.href);
        return href ? { type: "link", attrs: { href } } : null;
      })
      .filter((m): m is { type: string; attrs?: { href: string } } => m !== null);
    return [{ type: "text", text: n.text.slice(0, 50_000), ...(marks.length ? { marks } : {}) }];
  }

  if (!BLOCKS.has(n.type) && !INLINE.has(n.type)) {
    // Unknown node: keep its children (e.g. text) rather than dropping content.
    return (Array.isArray(n.content) ? n.content : []).flatMap((c) => sanitizeNode(c, depth + 1));
  }

  const out: PMNode = { type: n.type };
  const allowed = ALLOWED_ATTRS[n.type];
  if (allowed && n.attrs) {
    const attrs: Record<string, unknown> = {};
    for (const key of allowed) {
      const v = n.attrs[key];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null)
        attrs[key] = v;
    }
    if (n.type === "heading") attrs.level = Math.min(3, Math.max(1, Number(attrs.level) || 2));
    out.attrs = attrs;
  }
  if (Array.isArray(n.content)) out.content = n.content.flatMap((c) => sanitizeNode(c, depth + 1));
  return [out];
}

export function sanitizeDoc(doc: unknown): PMNode {
  const [root] = sanitizeNode(doc, 0);
  if (!root || root.type !== "doc") return { type: "doc", content: [{ type: "paragraph" }] };
  return root;
}

const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

const BLOCK_BREAK = new Set([
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "blockquote",
  "codeBlock",
]);

export function docToPlainText(doc: PMNode | null | undefined, max = 20_000): string {
  if (!doc) return "";
  const parts: string[] = [];
  const walk = (n: PMNode) => {
    if (n.type === "text" && n.text) parts.push(n.text);
    else if (n.type === "mention") parts.push(`@${str(n.attrs?.label)}`);
    else if (n.type === "workItemRef") parts.push(str(n.attrs?.identifier) || str(n.attrs?.label));
    else if (n.type === "hardBreak") parts.push("\n");
    n.content?.forEach(walk);
    if (BLOCK_BREAK.has(n.type)) parts.push("\n");
  };
  walk(doc);
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/**
 * Plain text for the AI teammate's prompt: like docToPlainText, but inline
 * code keeps its backticks and code blocks their fences, so "run `uptime`"
 * still says which part is the command.
 */
export function docToPromptText(doc: PMNode | null | undefined, max = 20_000): string {
  if (!doc) return "";
  const parts: string[] = [];
  const walk = (n: PMNode) => {
    if (n.type === "text" && n.text)
      parts.push(n.marks?.some((m) => m.type === "code") ? `\`${n.text}\`` : n.text);
    else if (n.type === "mention") parts.push(`@${str(n.attrs?.label)}`);
    else if (n.type === "workItemRef") parts.push(str(n.attrs?.identifier) || str(n.attrs?.label));
    else if (n.type === "hardBreak") parts.push("\n");
    if (n.type === "codeBlock") parts.push("```\n");
    n.content?.forEach(walk);
    if (n.type === "codeBlock") parts.push("\n```");
    if (BLOCK_BREAK.has(n.type)) parts.push("\n");
  };
  walk(doc);
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function isEmptyDoc(doc: PMNode | null | undefined): boolean {
  return docToPlainText(doc).length === 0;
}

function collect(doc: PMNode | null | undefined, type: string, attr: string): string[] {
  const out = new Set<string>();
  const walk = (n: PMNode) => {
    if (n.type === type && typeof n.attrs?.[attr] === "string") out.add(n.attrs[attr]);
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return [...out];
}

/** User ids mentioned with @. */
export const extractMentions = (doc: PMNode | null | undefined) => collect(doc, "mention", "id");
/** Work item ids referenced with #. */
export const extractItemRefs = (doc: PMNode | null | undefined) =>
  collect(doc, "workItemRef", "id");

/** Plain text → paragraphs; single line breaks become hard breaks (form text, emails). */
export function textToDoc(text: string): PMNode {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    type: "doc",
    content: paragraphs.length
      ? paragraphs.map((p) => ({
          type: "paragraph",
          content: p
            .split("\n")
            .flatMap((line, i): PMNode[] => [
              ...(i > 0 ? [{ type: "hardBreak" }] : []),
              ...(line ? [{ type: "text", text: line }] : []),
            ]),
        }))
      : [{ type: "paragraph" }],
  };
}

/* ───────────────────────── Markdown (the agent's answers) ───────────────────────── */

/** `code`, **bold**, *italic* and [links](https://…) inside one line. */
function inlineMarkdown(line: string): PMNode[] {
  const out: PMNode[] = [];
  const re =
    /`([^`]+)`|\*\*([^*]+)\*\*|(?<![\w*])\*([^*\s][^*]*)\*(?!\w)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index > last) out.push({ type: "text", text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: "text", text: m[1], marks: [{ type: "code" }] });
    else if (m[2] !== undefined) out.push({ type: "text", text: m[2], marks: [{ type: "bold" }] });
    else if (m[3] !== undefined)
      out.push({ type: "text", text: m[3], marks: [{ type: "italic" }] });
    else if (m[4] !== undefined)
      out.push({ type: "text", text: m[4], marks: [{ type: "link", attrs: { href: m[5] } }] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ type: "text", text: line.slice(last) });
  return out;
}

function paragraph(lines: string[]): PMNode {
  const content = lines.flatMap((line, i): PMNode[] => [
    ...(i > 0 ? [{ type: "hardBreak" }] : []),
    ...inlineMarkdown(line),
  ]);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

/**
 * The small Markdown subset models write (fenced code, `inline code`, bold,
 * italic, links, "- " and "1. " lists, "#" headings) → a sanitized doc, so
 * the agent's answer reads like a teammate's comment. Anything else stays text.
 */
export function markdownToDoc(markdown: string): PMNode {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: PMNode[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(paragraph(para));
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const fence = line.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      flush();
      const code: string[] = [];
      while (i + 1 < lines.length && !/^```\s*$/.test(lines[i + 1] ?? ""))
        code.push(lines[++i] ?? "");
      i++; // the closing fence
      blocks.push({
        type: "codeBlock",
        attrs: { language: fence[1] || null },
        ...(code.join("\n") ? { content: [{ type: "text", text: code.join("\n") }] } : {}),
      });
      continue;
    }
    const list = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (list) {
      flush();
      const ordered = /\d/.test(list[1] ?? "");
      const items: PMNode[] = [];
      let j = i;
      while (j < lines.length) {
        const m = (lines[j] ?? "").match(/^\s*([-*]|\d+\.)\s+(.*)$/);
        if (!m || /\d/.test(m[1] ?? "") !== ordered) break;
        items.push({ type: "listItem", content: [paragraph([m[2] ?? ""])] });
        j++;
      }
      i = j - 1;
      blocks.push({ type: ordered ? "orderedList" : "bulletList", content: items });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        attrs: { level: heading[1]?.length ?? 2 },
        content: inlineMarkdown(heading[2] ?? ""),
      });
      continue;
    }
    if (line.trim() === "") flush();
    else para.push(line);
  }
  flush();
  return sanitizeDoc({ type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] });
}

/* ───────────────────────── HTML (outgoing email) ───────────────────────── */

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const BLOCK_TAG: Record<string, string> = {
  paragraph: "p",
  bulletList: "ul",
  orderedList: "ol",
  taskList: "ul",
  listItem: "li",
  taskItem: "li",
  blockquote: "blockquote",
};

/**
 * Tiptap JSON → minimal HTML for an outgoing email reply (Phase 7b). The doc
 * is sanitized first, every text escaped, and links limited to http(s) and
 * mailto; @mentions and #INFRA-42 chips become plain text.
 */
export function docToHtml(raw: unknown): string {
  const doc = sanitizeDoc(raw);
  const attr = (n: PMNode, key: string): string => {
    const v = n.attrs?.[key];
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  };
  const inline = (n: PMNode): string => {
    if (n.type === "mention") return escapeHtml(`@${attr(n, "label")}`);
    if (n.type === "workItemRef") return escapeHtml(attr(n, "identifier") || attr(n, "label"));
    if (n.type === "hardBreak") return "<br>";
    let out = escapeHtml(n.text ?? "");
    for (const m of n.marks ?? []) {
      if (m.type === "bold") out = `<strong>${out}</strong>`;
      else if (m.type === "italic") out = `<em>${out}</em>`;
      else if (m.type === "strike") out = `<s>${out}</s>`;
      else if (m.type === "underline") out = `<u>${out}</u>`;
      else if (m.type === "code") out = `<code>${out}</code>`;
      else if (m.type === "link") {
        const href = safeHref(m.attrs?.href);
        if (href) out = `<a href="${escapeHtml(href)}">${out}</a>`;
      }
    }
    return out;
  };
  const block = (n: PMNode): string => {
    if (
      n.type === "text" ||
      n.type === "mention" ||
      n.type === "workItemRef" ||
      n.type === "hardBreak"
    )
      return inline(n);
    const inner = (n.content ?? []).map(block).join("");
    if (n.type === "doc") return inner;
    if (n.type === "heading") {
      const level = Math.min(3, Math.max(1, Number(n.attrs?.level ?? 2)));
      return `<h${level}>${inner}</h${level}>`;
    }
    if (n.type === "codeBlock") return `<pre><code>${inner}</code></pre>`;
    if (n.type === "horizontalRule") return "<hr>";
    if (n.type === "taskItem") return `<li>${n.attrs?.checked ? "☑" : "☐"} ${inner}</li>`;
    const tag = BLOCK_TAG[n.type];
    return tag ? `<${tag}>${inner}</${tag}>` : inner;
  };
  return block(doc);
}
