"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { EditorSources } from "@/components/editor/rich-text-editor";
import { Avatar } from "@/components/ui/avatar";
import { StateIcon } from "@/components/icons/state-icon";
import type { SearchHit } from "@/features/work-items/data";
import type { Person } from "./types";

/** @people who can read this conversation, #items from anywhere the writer can see. */
export function useChatSources(ws: string, people: Person[]): EditorSources {
  const t = useTranslations("messages");
  return useMemo(
    () => ({
      emptyLabel: t("noMatches"),
      people: (query: string) => {
        const q = query.toLowerCase();
        return people
          .filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().startsWith(q))
          .slice(0, 8)
          .map((p) => ({ id: p.id, label: p.name, icon: <Avatar user={p} size="xs" /> }));
      },
      items: async (query: string) => {
        const res = await fetch(`/api/v1/${ws}/search/items?q=${encodeURIComponent(query)}`);
        if (!res.ok) return [];
        const hits = (await res.json()) as SearchHit[];
        return hits.map((h) => ({
          id: h.id,
          label: h.identifier,
          hint: h.title.slice(0, 40),
          icon: <StateIcon group={h.stateGroup} size={14} />,
        }));
      },
    }),
    [ws, people, t],
  );
}
