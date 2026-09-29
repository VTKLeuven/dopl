"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Shortcut } from "@/components/ui/kbd";

/** The right side of Messages before a conversation is picked (desktop only). */
export function MessagesHome() {
  const t = useTranslations("messages");
  const { ws } = useParams<{ ws: string }>();
  return (
    <div className="hidden flex-1 flex-col md:flex" data-testid="messages-home" data-ws={ws}>
      <div className="h-[var(--header-height)] shrink-0 border-b border-border" />
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<MessagesSquare />}
          title={t("home.title")}
          description={
            <>
              {t("home.body")} <Shortcut keys="alt+up alt+down" className="align-middle" />
            </>
          }
        />
      </div>
    </div>
  );
}
