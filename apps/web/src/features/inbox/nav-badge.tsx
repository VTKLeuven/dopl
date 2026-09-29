"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useHydrated } from "@/lib/use-hydrated";
import { useInboxCounts } from "./data";

const PREFIX = /^\(\d+\+?\) /;

/**
 * Unread count for the sidebar's Inbox item (DESIGN_SYSTEM §4.1: a micro
 * number in muted text), mirrored into the tab title as "(3) Inbox · Dopl".
 * Realtime keeps it fresh in every tab.
 */
export function InboxNavBadge({ ws }: { ws: string }) {
  // Client-only: a server-side query would create an empty cache entry ahead
  // of the Inbox page's prefetched counts.
  return useHydrated() ? <Badge ws={ws} /> : null;
}

function Badge({ ws }: { ws: string }) {
  const t = useTranslations("inbox");
  const count = useInboxCounts(ws, "badge").data?.unread ?? 0;
  useTitleCount(count);
  if (count === 0) return null;
  return (
    <span
      className="text-micro font-semibold text-fg-muted tabular"
      aria-label={t("unreadBadge", { count })}
      data-testid="inbox-badge"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Keeps "(n) " in front of the document title, whatever page sets the rest. */
function useTitleCount(count: number) {
  useEffect(() => {
    const label = count > 99 ? "99+" : String(count);
    const apply = () => {
      const base = document.title.replace(PREFIX, "");
      const next = count > 0 ? `(${label}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Navigations replace the <title>; put the count back.
    const head = document.querySelector("head");
    const observer = new MutationObserver(apply);
    if (head) observer.observe(head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(PREFIX, "");
    };
  }, [count]);
}
