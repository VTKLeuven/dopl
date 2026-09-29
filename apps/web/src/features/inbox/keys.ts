import type { InboxFilter, InboxView } from "@dopl/shared/schemas/inbox";

/** Inbox query keys (one place; realtime invalidates `all`). */
export const inboxKeys = {
  all: (ws: string) => ["inbox", ws] as const,
  list: (ws: string, view: InboxView, filter: InboxFilter | null) =>
    ["inbox", ws, "list", view, filter ?? "any"] as const,
  counts: (ws: string) => ["inbox", ws, "counts"] as const,
};
