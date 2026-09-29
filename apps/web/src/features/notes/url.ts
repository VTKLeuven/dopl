"use client";

import { usePathname, useRouter } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

const FILTERS = ["all", "pinned", "shared", "archived", "trash"] as const;
export type GridFilter = (typeof FILTERS)[number];

export const notesUrlParsers = {
  filter: parseAsStringLiteral(FILTERS).withDefault("all"),
  tag: parseAsString,
  q: parseAsString,
  note: parseAsString,
};

/**
 * The notes grid's state lives in the URL (?filter=&tag=&q=, ?note= opens a
 * note). On /notes it changes shallowly (no server round trip); from the
 * to-dos and review pages it navigates there.
 */
export function useNotesUrl(ws: string) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useQueryStates(notesUrlParsers);
  const onGrid = pathname === `/${ws}/notes`;
  const go = (next: { filter?: GridFilter; tag?: string | null; q?: string | null }) => {
    if (onGrid) {
      void setState({
        filter: next.filter ?? "all",
        tag: next.tag ?? null,
        q: next.q === undefined ? state.q : next.q,
      });
      return;
    }
    const s = new URLSearchParams();
    if (next.filter && next.filter !== "all") s.set("filter", next.filter);
    if (next.tag) s.set("tag", next.tag);
    const qs = s.toString();
    router.push(`/${ws}/notes${qs ? `?${qs}` : ""}` as never);
  };
  return { ...state, onGrid, go, setState };
}
