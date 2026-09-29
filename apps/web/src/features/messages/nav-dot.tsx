"use client";

import { useTranslations } from "next-intl";
import { useHydrated } from "@/lib/use-hydrated";
import { useChannels } from "./data";

/**
 * A 6 px sky dot on the sidebar's Messages item when anything is unread
 * (DESIGN_SYSTEM §4.1). Client-only: querying during the server render would
 * create an empty cache entry ahead of the Messages page's prefetched data.
 */
export function MessagesNavDot({ ws }: { ws: string }) {
  return useHydrated() ? <Dot ws={ws} /> : null;
}

function Dot({ ws }: { ws: string }) {
  const t = useTranslations("messages");
  const { data } = useChannels(ws, "dot");
  const unread = data
    ? [...data.channels, ...data.projects, ...data.dms].some((c) => c.unread > 0 || c.mentions > 0)
    : false;
  if (!unread) return null;
  return (
    <span
      role="status"
      aria-label={t("unreadDot")}
      data-testid="messages-dot"
      className="mr-1 size-1.5 rounded-full bg-sky-600"
    />
  );
}
