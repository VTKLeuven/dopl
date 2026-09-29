import type { InboxFilter, InboxView } from "@dopl/shared/schemas/inbox";

/** Inbox query keys (one place; realtime invalidates `all`). */
export const inboxKeys = {
  all: (ws: string) => ["inbox", ws] as const,
  list: (ws: string, view: InboxView, filter: InboxFilter | null) =>
    ["inbox", ws, "list", view, filter ?? "any"] as const,
  counts: (ws: string) => ["inbox", ws, "counts"] as const,
  /**
   * The sidebar badge's own copy of the counts. Separate from `counts` so it
   * never races the Inbox page's hydrated data across Suspense boundaries;
   * invalidating `all` refreshes both.
   */
  badge: (ws: string) => ["inbox", ws, "counts", "badge"] as const,
};
