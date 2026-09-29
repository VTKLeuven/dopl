"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Section error for the notes pages: the sidebar and header stay, the page offers a retry. */
export default function NotesError({ error, retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("notes");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <EmptyState
      icon={<CloudOff />}
      title={t("errors.pageTitle")}
      description={t("errors.pageDescription")}
      action={
        <Button variant="secondary" onClick={() => retry()}>
          {t("retry")}
        </Button>
      }
    />
  );
}
