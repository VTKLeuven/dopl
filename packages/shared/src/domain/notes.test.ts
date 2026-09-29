import { describe, expect, it } from "vitest";
import {
  countOpenTodos,
  ensureBlockIds,
  expandTagPaths,
  extractTags,
  extractTodos,
  findTagTokens,
  markTodoConverted,
  newBlockId,
  normalizeTagPath,
  noteTitle,
  pickReviewSet,
  REVIEW_INTERVALS,
  reviewIntervalDays,
  reviewWeight,
  rewriteTagInDoc,
  setTodoChecked,
} from "./notes";
import { docToPlainText, type PMNode } from "./rich-text";

const p = (...content: PMNode[]): PMNode => ({ type: "paragraph", content });
const text = (t: string, marks?: PMNode["marks"]): PMNode => ({
  type: "text",
  text: t,
  ...(marks ? { marks } : {}),
});
const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content });
const task = (blockId: string | null, checked: boolean, label: string, nested?: PMNode) => ({
  type: "taskItem",
  attrs: { checked, ...(blockId ? { blockId } : {}) },
  content: [p(text(label)), ...(nested ? [nested] : [])],
});
const tasks = (...items: PMNode[]): PMNode => ({ type: "taskList", content: items });

describe("tag parsing", () => {
  it("finds inline and nested tags, lowercased, in order", () => {
    const d = doc(p(text("Proxmox upgrade #Infra/Proxmox and #meeting, also #infra.")));
    expect(extractTags(d)).toEqual(["infra/proxmox", "meeting", "infra"]);
  });

  it("requires a letter after # and a boundary before it", () => {
    expect(findTagTokens("#1 issue a#b https://x.be/#top #ok &#39;").map((t) => t.path)).toEqual([
      "ok",
    ]);
  });

  it("ignores headings, identifiers and code", () => {
    const d = doc(
      { type: "heading", attrs: { level: 1 }, content: [text("# Not a tag")] },
      p(text("See #INFRA-42 and "), text("#code", [{ type: "code" }]), text(" #real")),
      { type: "codeBlock", content: [text("#include <stdio.h>")] },
    );
    expect(extractTags(d)).toEqual(["real"]);
  });

  it("joins text split across marks", () => {
    const d = doc(p(text("#inf", [{ type: "bold" }]), text("ra/pve done")));
    expect(extractTags(d)).toEqual(["infra/pve"]);
  });

  it("supports letters beyond ASCII and trims trailing separators", () => {
    expect(findTagTokens("#café/menu/ en #überall-").map((t) => t.path)).toEqual([
      "café/menu",
      "überall",
    ]);
  });

  it("normalizes paths", () => {
    expect(normalizeTagPath("#Infra//Proxmox/")).toBe("infra/proxmox");
    expect(normalizeTagPath("9lives")).toBeNull();
    expect(normalizeTagPath("a/b c")).toBeNull();
    expect(normalizeTagPath("x".repeat(101))).toBeNull();
  });

  it("creates parents implicitly", () => {
    expect(expandTagPaths(["infra/proxmox/pve-02", "meeting"])).toEqual([
      "infra",
      "meeting",
      "infra/proxmox",
      "infra/proxmox/pve-02",
    ]);
  });

  it("rewrites a tag and its children on rename", () => {
    const d = doc(p(text("#infra/proxmox notes, #INFRA and #infrastructure stay #other")));
    const out = rewriteTagInDoc(d, "infra", "ops");
    expect(docToPlainText(out)).toBe("#ops/proxmox notes, #ops and #infrastructure stay #other");
  });

  it("removes the token when a tag is deleted", () => {
    const d = doc(p(text("a #old b #old/child")), p(text("#old")));
    const out = rewriteTagInDoc(d, "old", null);
    expect(docToPlainText(out)).toBe("a b");
    expect(extractTags(out)).toEqual([]);
  });
});

describe("to-do projection", () => {
  it("assigns missing and duplicate block ids, keeps valid ones", () => {
    let n = 0;
    const gen = () => `gen${++n}xx`;
    const d = doc(
      tasks(task("keep1234", false, "a"), task(null, true, "b"), task("keep1234", false, "c")),
    );
    const out = ensureBlockIds(d, gen);
    expect(extractTodos(out).map((t) => t.blockId)).toEqual(["keep1234", "gen1xx", "gen2xx"]);
    expect(ensureBlockIds(out, gen)).toEqual(out); // idempotent
  });

  it("projects text, checked state and position, including nested items", () => {
    const d = doc(
      p(text("Plan #infra")),
      tasks(
        task("aaaa1111", false, "Back up pve-01", tasks(task("bbbb2222", true, "Check the NAS"))),
        task("cccc3333", false, "Upgrade"),
      ),
    );
    expect(extractTodos(d)).toEqual([
      { blockId: "aaaa1111", text: "Back up pve-01", checked: false, position: 0 },
      { blockId: "bbbb2222", text: "Check the NAS", checked: true, position: 1 },
      { blockId: "cccc3333", text: "Upgrade", checked: false, position: 2 },
    ]);
  });

  it("toggles exactly one node, matched by block id", () => {
    const d = doc(tasks(task("aaaa1111", false, "a"), task("bbbb2222", false, "b")));
    const { doc: out, found } = setTodoChecked(d, "bbbb2222", true);
    expect(found).toBe(true);
    expect(extractTodos(out).map((t) => t.checked)).toEqual([false, true]);
    expect(setTodoChecked(d, "missing1", true).found).toBe(false);
  });

  it("strikes a converted line through and appends the item chip", () => {
    const d = doc(tasks(task("aaaa1111", false, "Replace the UPS battery")));
    const { doc: out } = markTodoConverted(d, "aaaa1111", { id: "w1", identifier: "INFRA-7" });
    const para = out.content?.[0]?.content?.[0]?.content?.[0];
    expect(para?.content).toEqual([
      { type: "text", text: "Replace the UPS battery", marks: [{ type: "strike" }] },
      { type: "text", text: " " },
      { type: "workItemRef", attrs: { id: "w1", identifier: "INFRA-7", label: "INFRA-7" } },
    ]);
    // Converting again doesn't duplicate the chip.
    const again = markTodoConverted(out, "aaaa1111", { id: "w1", identifier: "INFRA-7" }).doc;
    expect(docToPlainText(again)).toBe("Replace the UPS battery INFRA-7");
  });

  it("counts open to-dos (unchecked, not converted)", () => {
    expect(
      countOpenTodos([{ checked: false }, { checked: true }, { checked: false, workItemId: "w1" }]),
    ).toBe(1);
  });

  it("makes short unique block ids", () => {
    const ids = new Set(Array.from({ length: 500 }, newBlockId));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{10,}$/);
  });
});

describe("note title", () => {
  it("takes the first non-empty line", () => {
    expect(noteTitle("\n  Proxmox upgrade  \nsecond line")).toBe("Proxmox upgrade");
    expect(noteTitle("a".repeat(100), 10)).toBe("aaaaaaaaa…");
  });
});

describe("daily review", () => {
  const now = new Date("2026-09-29T08:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it("spaces reviews 1 → 3 → 7 → 21 → 60 days", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(reviewIntervalDays)).toEqual([1, 3, 7, 21, 60, 60, 60]);
    expect(REVIEW_INTERVALS).toEqual([1, 3, 7, 21, 60]);
  });

  it("weighs older and rarely reviewed notes higher", () => {
    expect(reviewWeight({ createdAt: daysAgo(100), reviewCount: 0 }, now)).toBeGreaterThan(
      reviewWeight({ createdAt: daysAgo(10), reviewCount: 0 }, now),
    );
    expect(reviewWeight({ createdAt: daysAgo(100), reviewCount: 0 }, now)).toBeGreaterThan(
      reviewWeight({ createdAt: daysAgo(100), reviewCount: 4 }, now),
    );
  });

  it("picks a stable, limited set per seed", () => {
    const notes = Array.from({ length: 20 }, (_, i) => ({
      id: `n${i}`,
      createdAt: daysAgo(i + 1),
      reviewCount: i % 3,
    }));
    const a = pickReviewSet(notes, { now, seed: "u1:2026-09-29", limit: 5 });
    const b = pickReviewSet([...notes].reverse(), { now, seed: "u1:2026-09-29", limit: 5 });
    expect(a).toHaveLength(5);
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
    expect(pickReviewSet(notes, { now, seed: "x", limit: 0 })).toEqual([]);
    // Handling one note leaves the others in place.
    const rest = pickReviewSet(
      notes.filter((n) => n.id !== a[0]?.id),
      { now, seed: "u1:2026-09-29", limit: 4 },
    );
    expect(rest.map((n) => n.id)).toEqual(a.slice(1).map((n) => n.id));
  });

  it("favours old notes over many days", () => {
    const old = { id: "old", createdAt: daysAgo(200), reviewCount: 0 };
    const fresh = { id: "fresh", createdAt: daysAgo(2), reviewCount: 0 };
    let oldWins = 0;
    for (let d = 0; d < 200; d++) {
      const [first] = pickReviewSet([old, fresh], { now, seed: `u:${d}`, limit: 1 });
      if (first?.id === "old") oldWins++;
    }
    expect(oldWins).toBeGreaterThan(150);
  });
});
