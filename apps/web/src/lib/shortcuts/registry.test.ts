import { describe, expect, it } from "vitest";
import { comboOf, findConflicts, SHORTCUTS } from "./registry";

const ev = (
  key: string,
  mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("shortcut registry", () => {
  it("has no conflicting bindings within a scope", () => {
    expect(findConflicts()).toEqual([]);
    expect(
      findConflicts([
        { id: "a", keys: "x", scope: "list" },
        { id: "b", keys: "x", scope: "list" },
        { id: "c", keys: "x", scope: "peek" },
      ]),
    ).toEqual(["a and b both use x in list"]);
  });

  it("normalizes key events to combos", () => {
    expect(comboOf(ev("k", { metaKey: true }))).toBe("mod+k");
    expect(comboOf(ev("k", { ctrlKey: true }))).toBe("mod+k");
    expect(comboOf(ev("H", { shiftKey: true }))).toBe("shift+h");
    expect(comboOf(ev("?", { shiftKey: true }))).toBe("?");
    expect(comboOf({ ...ev("<", { metaKey: true, shiftKey: true }), code: "Comma" })).toBe(
      "mod+shift+,",
    );
    expect(comboOf({ ...ev(".", { metaKey: true }), code: "Period" })).toBe("mod+.");
    expect(comboOf(ev("ArrowDown"))).toBe("down");
    expect(comboOf(ev("Backspace", { metaKey: true }))).toBe("mod+backspace");
    expect(comboOf(ev(" "))).toBe("space");
  });

  it("every shortcut id is unique", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
