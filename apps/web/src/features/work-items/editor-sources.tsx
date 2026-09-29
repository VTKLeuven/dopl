"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { EditorSources } from "@/components/editor/rich-text-editor";
import { Avatar } from "@/components/ui/avatar";
import { StateIcon } from "@/components/icons/state-icon";
import type { SearchHit } from "./data";
import type { ProjectMeta } from "./types";

/** @people from the project's members, #items from the search endpoint. */
export function useEditorSources(ws: string, meta: ProjectMeta): EditorSources {
  const t = useTranslations("items");
  return useMemo(
    () => ({
      emptyLabel: t("noValue"),
      people: (query: string) =>
        meta.members
          .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()) || m.email.toLowerCase().startsWith(query.toLowerCase()))
          .slice(0, 8)
          .map((m) => ({ id: m.id, label: m.name, icon: <Avatar user={m} size="xs" /> })),
      items: async (query: string) => {
        const res = await fetch(`/api/v1/${ws}/search/items?q=${encodeURIComponent(query)}`);
        if (!res.ok) return [];
        const hits = (await res.json()) as SearchHit[];
        return hits.map((h) => ({ id: h.id, label: h.identifier, hint: h.title.slice(0, 40), icon: <StateIcon group={h.stateGroup} size={14} /> }));
      },
    }),
    [ws, meta.members, t],
  );
}
