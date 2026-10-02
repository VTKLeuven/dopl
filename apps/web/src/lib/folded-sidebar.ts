/**
 * Which pages have their secondary column folded to icons (D-137). One cookie
 * for all of them, so a page's server render already has the right width.
 * Shared by the server loaders and the client toggle; no React, no Next.
 */
export const SIDEBAR_AREAS = ["mail", "notes", "settings", "analytics", "messages"] as const;
export type SidebarArea = (typeof SIDEBAR_AREAS)[number];

export const FOLDED_COOKIE = "dopl-folded";

/** "mail.notes" → {mail, notes}; unknown names are dropped. */
export function parseFolded(raw: string | undefined | null): Set<SidebarArea> {
  const known = new Set<string>(SIDEBAR_AREAS);
  return new Set((raw ?? "").split(".").filter((a): a is SidebarArea => known.has(a)));
}

export function serializeFolded(areas: Iterable<SidebarArea>): string {
  return [...areas].sort().join(".");
}
