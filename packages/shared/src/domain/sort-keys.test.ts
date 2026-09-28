import { describe, expect, it } from "vitest";
import { compareSortKeys, keyAfter, keyBefore, keyBetween, keysBetween } from "./sort-keys";

describe("sort keys", () => {
  it("orders appended and prepended keys correctly", () => {
    let first = keyAfter(null);
    let last = first;
    const keys = [first];
    for (let i = 0; i < 50; i++) {
      last = keyAfter(last);
      keys.push(last);
      first = keyBefore(first);
      keys.unshift(first);
    }
    const shuffled = [...keys].sort(() => Math.random() - 0.5);
    expect(shuffled.sort(compareSortKeys)).toEqual(keys);
  });

  it("can always insert between two neighbours", () => {
    let a = keyAfter(null);
    const b = keyAfter(a);
    for (let i = 0; i < 200; i++) {
      const mid = keyBetween(a, b);
      expect(compareSortKeys(a, mid)).toBe(-1);
      expect(compareSortKeys(mid, b)).toBe(-1);
      a = mid;
    }
  });

  it("produces keys that break under locale collation (why we need COLLATE \"C\")", () => {
    const top = keyBefore(keyBefore(keyAfter(null)));
    // Uppercase-led keys appear once you insert above the first item.
    expect(top).toMatch(/^[A-Z]/);
    expect(compareSortKeys(top, "a0")).toBe(-1);
    expect(top.localeCompare("a0", "en")).toBe(1); // locale order disagrees
  });

  it("generates n evenly spaced keys", () => {
    const keys = keysBetween(null, null, 5);
    expect([...keys].sort(compareSortKeys)).toEqual(keys);
  });
});
