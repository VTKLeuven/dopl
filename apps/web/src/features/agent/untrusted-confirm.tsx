"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Pending = { onConfirm: () => void } | null;
let open: (p: Pending) => void = () => undefined;

/**
 * D-033: assigning the AI teammate to an item written outside the team
 * (intake, email) is confirmed first. The item mutation calls this when the
 * server answers `agent_untrusted`, then retries with `confirmUntrusted`.
 */
export function requestUntrustedConfirm(onConfirm: () => void) {
  open({ onConfirm });
}

export function UntrustedAssignDialog() {
  const t = useTranslations("agent.untrustedAssign");
  const [pending, setPending] = useState<Pending>(null);
  useEffect(() => {
    open = setPending;
    return () => {
      open = () => undefined;
    };
  }, []);
  return (
    <Dialog open={Boolean(pending)} onOpenChange={(o) => (o ? null : setPending(null))}>
      <DialogContent data-testid="untrusted-assign-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPending(null)}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            data-testid="untrusted-assign-confirm"
            onClick={() => {
              pending?.onConfirm();
              setPending(null);
            }}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
