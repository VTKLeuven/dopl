import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Fractional-index sort keys (D-014).
 *
 * Keys compare correctly ONLY in byte order: the database columns use
 * COLLATE "C", and in JS we compare with plain `<` — never `localeCompare`.
 */
export type SortKey = string;

export function keyBetween(before: SortKey | null, after: SortKey | null): SortKey {
  return generateKeyBetween(before, after);
}

export function keysBetween(before: SortKey | null, after: SortKey | null, n: number): SortKey[] {
  return generateNKeysBetween(before, after, n);
}

/** Key for appending after the current last item. */
export function keyAfter(last: SortKey | null): SortKey {
  return generateKeyBetween(last, null);
}

/** Key for inserting before the current first item. */
export function keyBefore(first: SortKey | null): SortKey {
  return generateKeyBetween(null, first);
}

export function compareSortKeys(a: SortKey, b: SortKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
