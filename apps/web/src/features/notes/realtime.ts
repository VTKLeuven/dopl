"use client";

import type { QueryClient } from "@tanstack/react-query";
import { invalidateNotes } from "./data";

const FLUSH_MS = 150;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Note events (`note.*` on user:, workspace:, project: and workItem: topics)
 * refetch the notes caches: grids, to-dos, tags, review, Home widgets and the
 * notes on an item. Batched, and held while local writes are in flight so a
 * refetch never lands between an optimistic update and its write (D-063).
 * Returns true when the event was a note event (the caller skips it then).
 */
export function handleNotesEvent(qc: QueryClient, ws: string, type: string): boolean {
  if (!type.startsWith("note.")) return false;
  const flush = () => {
    timer = null;
    if (qc.isMutating() > 0) {
      timer = setTimeout(flush, FLUSH_MS);
      return;
    }
    void invalidateNotes(qc, ws);
  };
  timer ??= setTimeout(flush, FLUSH_MS);
  return true;
}
