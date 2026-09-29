"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shortcut } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { PageHeader, type Crumb } from "@/components/shell/page-header";
import { openQuickCapture } from "./quick-capture";

export function NotesHeader({ ws }: { ws: string }) {
  const t = useTranslations("notes");
  const pathname = usePathname();
  const crumbs: Crumb[] = [{ label: t("title"), icon: <StickyNote />, href: `/${ws}/notes` }];
  if (pathname.endsWith("/notes/todos")) crumbs.push({ label: t("nav.todos") });
  else if (pathname.endsWith("/notes/review")) crumbs.push({ label: t("nav.review") });
  return (
    <PageHeader
      crumbs={crumbs}
      actions={
        <Tooltip content={t("newNote")} shortcut="q">
          <Button variant="primary" onClick={openQuickCapture} data-testid="new-note">
            <Plus />
            <span className="hidden sm:inline">{t("newNote")}</span>
            <Shortcut keys="q" tone="inverted" className="hidden sm:inline-flex" />
          </Button>
        </Tooltip>
      }
    />
  );
}
