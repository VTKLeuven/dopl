/**
 * Pure note logic (DATA_MODEL §3.5, D-022): inline #tags, the to-do
 * projection keyed by stable task-node block ids, and the daily review
 * schedule. Runs on the server (source of truth) and in the browser
 * (optimistic updates), so it must stay dependency-free.
 */
import { docToPlainText, type PMNode } from "./rich-text";

/* ───────────────────────── tags ───────────────────────── */

/**
 * `#` + a letter, then letters, digits, `-`, `_` or `/` (nested tags).
 * Not preceded by a word character, `/`, `#` or `&`, so `a#b`, URL
 * fragments (`/#top`) and entities never count.
 */
const TAG_RE = /(?<![\p{L}\p{N}_/#&])#(\p{L}[\p{L}\p{N}_\-/]*)/gu;
/** `#INFRA-42` written by hand is a work-item identifier, not a tag. */
const IDENTIFIER_RE = /^[A-Z][A-Z0-9]{1,9}-\d+$/;

export const TAG_MAX_LENGTH = 100;
export const TAG_MAX_DEPTH = 6;

/** Lowercases and tidies a raw tag path; null when nothing usable is left. */
export function normalizeTagPath(raw: string): string | null {
  const segments = raw
    .replace(/^#/, "")
    .toLowerCase()
    .split("/")
    .map((s) => s.replace(/^[-_]+|[-_]+$/g, ""))
    .filter(Boolean)
    .slice(0, TAG_MAX_DEPTH);
  const first = segments[0];
  if (!first || !/^\p{L}/u.test(first)) return null;
  if (segments.some((s) => !/^[\p{L}\p{N}_-]+$/u.test(s))) return null;
  const path = segments.join("/");
  return path.length > TAG_MAX_LENGTH ? null : path;
}

/** Tag tokens in a plain string, in order, with their positions. */
export function findTagTokens(
  text: string,
): Array<{ start: number; end: number; raw: string; path: string }> {
  const out: Array<{ start: number; end: number; raw: string; path: string }> = [];
  for (const m of text.matchAll(TAG_RE)) {
    let raw = m[1] ?? "";
    // A trailing "/" or "-" ends a sentence, not the tag ("#infra/." → infra).
    raw = raw.replace(/[-_/]+$/, "");
    if (!raw || IDENTIFIER_RE.test(raw)) continue;
    const path = normalizeTagPath(raw);
    if (!path) continue;
    const start = m.index;
    out.push({ start, end: start + 1 + raw.length, raw, path });
  }
  return out;
}

const isCode = (n: PMNode) => n.marks?.some((m) => m.type === "code") ?? false;

/** Text of each text block (paragraph, heading…), joining marks; code is skipped. */
function textBlocks(doc: PMNode | null | undefined): string[] {
  const blocks: string[] = [];
  const walk = (n: PMNode) => {
    if (n.type === "codeBlock") return;
    const inline = n.content?.some((c) => c.type === "text" || c.type === "hardBreak");
    if (inline && n.content) {
      blocks.push(
        n.content
          .map((c) => (c.type === "text" ? (isCode(c) ? " " : (c.text ?? "")) : " "))
          .join(""),
      );
      return;
    }
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return blocks;
}

/** Tag paths written in a note, lowercased and deduplicated, in order of appearance. */
export function extractTags(doc: PMNode | null | undefined): string[] {
  const seen = new Set<string>();
  for (const text of textBlocks(doc))
    for (const t of findTagTokens(text)) if (!seen.has(t.path)) seen.add(t.path);
  return [...seen];
}

/** Every path plus its ancestors (`infra/proxmox` → `infra`, `infra/proxmox`), parents first. */
export function expandTagPaths(paths: readonly string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join("/"));
  }
  return [...out].sort((a, b) => depthOf(a) - depthOf(b) || (a < b ? -1 : a > b ? 1 : 0));
}

export const depthOf = (path: string) => path.split("/").length;
export const parentPath = (path: string): string | null =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;
export const tagName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** True when `path` is `root` or nested under it. */
export const isUnderTag = (path: string, root: string) =>
  path === root || path.startsWith(`${root}/`);

/**
 * Rewrites `#from` (and `#from/child…`) tokens to `#to…`, or removes them when
 * `to` is null (deleting a tag). Used by rename, merge and delete, which the
 * user confirms first.
 */
export function rewriteTagInDoc(doc: PMNode, from: string, to: string | null): PMNode {
  const rewrite = (text: string): string => {
    const tokens = findTagTokens(text).filter((t) => isUnderTag(t.path, from));
    if (tokens.length === 0) return text;
    let out = "";
    let last = 0;
    for (const t of tokens) {
      out += text.slice(last, t.start);
      if (to !== null) out += `#${to}${t.path.slice(from.length)}`;
      else if (text[t.end] === " " && (t.start === 0 || text[t.start - 1] === " ")) {
        last = t.end + 1; // swallow one space so "a #x b" becomes "a b"
        continue;
      }
      last = t.end;
    }
    return out + text.slice(last);
  };
  const walk = (n: PMNode): PMNode | null => {
    if (n.type === "codeBlock") return n;
    if (n.type === "text") {
      if (!n.text || isCode(n)) return n;
      const text = rewrite(n.text);
      return text ? { ...n, text } : null;
    }
    if (!n.content) return n;
    return { ...n, content: n.content.map(walk).filter((c): c is PMNode => c !== null) };
  };
  return walk(doc) ?? doc;
}

/* ───────────────────────── to-dos (D-022) ───────────────────────── */

const BLOCK_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** A short random id for a task node; stable once written. */
export function newBlockId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `t${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("")}`;
}

function mapTaskItems(doc: PMNode, fn: (item: PMNode) => PMNode): PMNode {
  const walk = (n: PMNode): PMNode => {
    const next = n.type === "taskItem" ? fn(n) : n;
    return next.content ? { ...next, content: next.content.map(walk) } : next;
  };
  return walk(doc);
}

/**
 * Gives every task item a unique, well-formed `blockId`. Clients add ids on
 * creation; the server re-checks because pasted or split items can arrive
 * without one or with a copy of their neighbour's.
 */
export function ensureBlockIds(doc: PMNode, gen: () => string = newBlockId): PMNode {
  const seen = new Set<string>();
  return mapTaskItems(doc, (item) => {
    const current = item.attrs?.blockId;
    let id = typeof current === "string" && BLOCK_ID_RE.test(current) ? current : null;
    if (!id || seen.has(id)) id = gen();
    seen.add(id);
    return {
      ...item,
      attrs: { ...item.attrs, checked: Boolean(item.attrs?.checked), blockId: id },
    };
  });
}

export interface TodoProjection {
  blockId: string;
  text: string;
  checked: boolean;
  position: number;
}

/** The task items of a note in document order (nested items included). */
export function extractTodos(doc: PMNode | null | undefined): TodoProjection[] {
  const out: TodoProjection[] = [];
  const walk = (n: PMNode) => {
    if (n.type === "taskItem") {
      const blockId = n.attrs?.blockId;
      if (typeof blockId === "string" && blockId) {
        const first = n.content?.find((c) => c.type === "paragraph");
        out.push({
          blockId,
          text: docToPlainText(first ?? null, 500).replace(/\s+/g, " "),
          checked: Boolean(n.attrs?.checked),
          position: out.length,
        });
      }
    }
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return out;
}

/** Sets one task item's checkbox (matched by blockId); `found` is false when it's gone. */
export function setTodoChecked(
  doc: PMNode,
  blockId: string,
  checked: boolean,
): { doc: PMNode; found: boolean } {
  let found = false;
  const next = mapTaskItems(doc, (item) => {
    if (item.attrs?.blockId !== blockId) return item;
    found = true;
    return { ...item, attrs: { ...item.attrs, checked } };
  });
  return { doc: next, found };
}

/**
 * After a checkbox line becomes a work item: its text is struck through and
 * an `#INFRA-n` chip (a `workItemRef` node) is appended to the line.
 */
export function markTodoConverted(
  doc: PMNode,
  blockId: string,
  ref: { id: string; identifier: string },
): { doc: PMNode; found: boolean } {
  let found = false;
  const next = mapTaskItems(doc, (item) => {
    if (item.attrs?.blockId !== blockId || !item.content) return item;
    found = true;
    let done = false;
    const content = item.content.map((child) => {
      if (done || child.type !== "paragraph") return child;
      done = true;
      const inline = (child.content ?? [])
        .filter((c) => !(c.type === "workItemRef" && c.attrs?.id === ref.id))
        .map((c) =>
          c.type === "text" && !c.marks?.some((m) => m.type === "strike")
            ? { ...c, marks: [...(c.marks ?? []), { type: "strike" }] }
            : c,
        );
      const last = inline.at(-1);
      if (last && !(last.type === "text" && last.text?.endsWith(" "))) {
        inline.push({ type: "text", text: " " });
      }
      inline.push({
        type: "workItemRef",
        attrs: { id: ref.id, identifier: ref.identifier, label: ref.identifier },
      });
      return { ...child, content: inline };
    });
    return { ...item, content };
  });
  return { doc: next, found };
}

/** Open = unchecked and not turned into a work item. */
export function countOpenTodos(
  todos: ReadonlyArray<{ checked: boolean; workItemId?: string | null }>,
): number {
  return todos.filter((t) => !t.checked && !t.workItemId).length;
}

/* ───────────────────────── previews ───────────────────────── */

/** A one-line title for lists, the palette and dialogs: the first non-empty line. */
export function noteTitle(contentText: string, max = 80): string {
  const line =
    contentText
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/* ───────────────────────── daily review ───────────────────────── */

/** Days until the next review after the n-th keep (creation counts as 0): 1 → 3 → 7 → 21 → 60. */
export const REVIEW_INTERVALS = [1, 3, 7, 21, 60] as const;
export const REVIEW_DAILY_LIMIT = 5;
export const SNOOZE_OPTIONS = [1, 3, 7] as const;

export function reviewIntervalDays(reviewCount: number): number {
  const i = Math.min(Math.max(0, Math.floor(reviewCount)), REVIEW_INTERVALS.length - 1);
  return REVIEW_INTERVALS[i] ?? 60;
}

const MS_DAY = 86_400_000;

export function addDaysTo(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_DAY);
}

/** Older and rarely reviewed notes weigh more. */
export function reviewWeight(note: { createdAt: Date; reviewCount: number }, now: Date): number {
  const ageDays = Math.max(1, (now.getTime() - note.createdAt.getTime()) / MS_DAY);
  return ageDays / (1 + Math.max(0, note.reviewCount));
}

/** FNV-1a → (0, 1): a stable pseudo-random number per string. */
function unitHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h + 1) / 4294967297;
}

/**
 * Weighted sample without replacement (Efraimidis–Spirakis with exponential
 * keys), deterministic per `seed` (user + day) so the set doesn't reshuffle on
 * every visit. Handled notes drop out; the rest keep their order.
 */
export function pickReviewSet<T extends { id: string; createdAt: Date; reviewCount: number }>(
  candidates: readonly T[],
  opts: { now: Date; seed: string; limit: number },
): T[] {
  if (opts.limit <= 0) return [];
  return candidates
    .map((c) => ({
      c,
      key: -Math.log(unitHash(`${opts.seed}:${c.id}`)) / reviewWeight(c, opts.now),
    }))
    .sort((a, b) => a.key - b.key || (a.c.id < b.c.id ? -1 : 1))
    .slice(0, opts.limit)
    .map((x) => x.c);
}
