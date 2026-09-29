/**
 * The one shortcut registry (DESIGN_SYSTEM §7.1). Handlers resolve key events
 * through `resolveShortcut`, tooltips and menus read `keysFor`, and the `?`
 * overlay lists everything here. Labels are next-intl keys under "shortcuts".
 */
export type ShortcutScope = "global" | "list" | "table" | "calendar" | "timeline" | "peek";

export interface ShortcutDef {
  id: string;
  /** "mod+k", "shift+h", "?" or a sequence like "g h". */
  keys: string;
  scope: ShortcutScope;
}

export const SHORTCUTS = [
  { id: "palette", keys: "mod+k", scope: "global" },
  { id: "help", keys: "?", scope: "global" },
  { id: "goHome", keys: "g h", scope: "global" },
  { id: "goProjects", keys: "g p", scope: "global" },
  { id: "goViews", keys: "g v", scope: "global" },
  { id: "goSettings", keys: "g s", scope: "global" },
  { id: "create", keys: "c", scope: "list" },
  { id: "search", keys: "/", scope: "list" },
  { id: "down", keys: "j", scope: "list" },
  { id: "up", keys: "k", scope: "list" },
  { id: "downArrow", keys: "down", scope: "list" },
  { id: "upArrow", keys: "up", scope: "list" },
  { id: "open", keys: "enter", scope: "list" },
  { id: "openFull", keys: "mod+enter", scope: "list" },
  { id: "select", keys: "x", scope: "list" },
  { id: "selectAll", keys: "mod+a", scope: "list" },
  { id: "clear", keys: "esc", scope: "list" },
  { id: "state", keys: "s", scope: "list" },
  { id: "priority", keys: "p", scope: "list" },
  { id: "assign", keys: "a", scope: "list" },
  { id: "assignMe", keys: "shift+a", scope: "list" },
  { id: "labels", keys: "l", scope: "list" },
  { id: "due", keys: "d", scope: "list" },
  { id: "toggleDone", keys: "shift+h", scope: "list" },
  { id: "copyLink", keys: "mod+shift+,", scope: "list" },
  { id: "copyId", keys: "mod+.", scope: "list" },
  { id: "delete", keys: "mod+backspace", scope: "list" },
  { id: "cellMove", keys: "left right", scope: "table" },
  { id: "cellEdit", keys: "enter", scope: "table" },
  { id: "cellPeek", keys: "space", scope: "table" },
  { id: "moveDay", keys: "shift+left shift+right", scope: "calendar" },
  { id: "moveWeek", keys: "shift+up shift+down", scope: "calendar" },
  { id: "barMove", keys: "shift+left shift+right", scope: "timeline" },
  { id: "barResize", keys: "shift+alt+right", scope: "timeline" },
  { id: "peekClose", keys: "esc", scope: "peek" },
  { id: "peekNext", keys: "j k", scope: "peek" },
] as const satisfies readonly ShortcutDef[];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

const byId = new Map<string, ShortcutDef>(SHORTCUTS.map((s) => [s.id, s]));

export function keysFor(id: ShortcutId): string {
  return byId.get(id)?.keys ?? "";
}

const PUNCTUATION_CODES: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  BracketLeft: "[",
  BracketRight: "]",
};

/** Normalized combo for a key event, e.g. "mod+shift+," or "?" or "j". */
export function comboOf(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> & {
    code?: string;
  },
): string {
  const named: Record<string, string> = {
    ArrowDown: "down",
    ArrowUp: "up",
    ArrowLeft: "left",
    ArrowRight: "right",
    Enter: "enter",
    Escape: "esc",
    Backspace: "backspace",
    " ": "space",
  };
  const mod = e.metaKey || e.ctrlKey;
  // With ⌘/Ctrl held, read punctuation from the physical key: ⌘⇧, reports "<".
  const physical = mod && e.code ? PUNCTUATION_CODES[e.code] : undefined;
  const raw = physical ?? named[e.key] ?? e.key.toLowerCase();
  // Without a modifier, shifted punctuation ("?") is its own key; don't also report shift.
  const printableShifted = !physical && e.key.length === 1 && !/[a-z]/i.test(e.key) && e.shiftKey;
  const parts: string[] = [];
  if (mod) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey && !printableShifted) parts.push("shift");
  parts.push(raw);
  return parts.join("+");
}

/**
 * The shortcut a key event triggers within the given scopes, or null.
 * Single combos only; sequences ("g h") are handled by the global listener.
 */
export function resolveShortcut(e: KeyboardEvent, scopes: ShortcutScope[]): ShortcutId | null {
  const combo = comboOf(e);
  for (const s of SHORTCUTS) {
    if (!scopes.includes(s.scope) || s.keys.includes(" ")) continue;
    if (s.keys === combo) return s.id;
  }
  return null;
}

/** True when focus is in a text field or an open menu/dialog that owns the keys. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    Boolean(el.closest("[role=dialog],[role=listbox],[role=menu],[cmdk-root]"))
  );
}

/** Same keys bound twice in one scope (sequences excluded). Checked by a unit test. */
export function findConflicts(defs: readonly ShortcutDef[] = SHORTCUTS): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const d of defs) {
    const k = `${d.scope}:${d.keys}`;
    const prev = seen.get(k);
    if (prev) out.push(`${prev} and ${d.id} both use ${d.keys} in ${d.scope}`);
    seen.set(k, d.id);
  }
  return out;
}
