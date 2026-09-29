"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";

/** "2h ago" / "just now", re-rendering every minute. */
export function useRelativeTime() {
  const format = useFormatter();
  const t = useTranslations("common");
  const now = useNow({ updateInterval: 60_000 });
  return (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    if (Math.abs(now.getTime() - d.getTime()) < 45_000) return t("justNow");
    return format.relativeTime(d, now);
  };
}
