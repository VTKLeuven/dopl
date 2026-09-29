"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { markItemReviewedAction } from "@/server/actions/agent";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";

/**
 * D-033: this item was written outside the team (a form, an email). Agent
 * runs that read it need approval for every action, until an admin reads
 * it and marks it reviewed.
 */
export function UntrustedBanner({
  ws,
  item,
  onReviewed,
}: {
  ws: string;
  item: { id: string; origin: string; canMarkReviewed: boolean };
  onReviewed: () => unknown;
}) {
  const t = useTranslations("agent.untrustedItem");
  const [busy, setBusy] = useState(false);
  return (
    <Banner
      tone="warning"
      title={t("title")}
      action={
        item.canMarkReviewed ? (
          <Button
            size="xs"
            variant="secondary"
            disabled={busy}
            data-testid="mark-reviewed"
            onClick={async () => {
              setBusy(true);
              const res = await markItemReviewedAction(ws, item.id);
              setBusy(false);
              if (res.ok) {
                toast(t("reviewed"));
                void onReviewed();
              } else toast.error(t("error"));
            }}
          >
            {t("markReviewed")}
          </Button>
        ) : undefined
      }
    >
      <span data-testid="untrusted-banner">
        {t(item.origin === "EMAIL" ? "bodyEmail" : "bodyForm")}
      </span>
    </Banner>
  );
}
