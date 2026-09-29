"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Section error: the header and sidebar stay, the page offers a retry. */
export default function AnalyticsError({ error, retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("analytics");
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
          {t("widget.retry")}
        </Button>
      }
    />
  );
}
