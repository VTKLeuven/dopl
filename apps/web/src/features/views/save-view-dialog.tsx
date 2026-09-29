"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FilterGroup } from "@dopl/shared/schemas/filters";
import type { DisplayOptions } from "@dopl/shared/schemas/view";
import { createViewAction, updateViewAction } from "@/server/actions/views";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";

/** Where a view's page lives: under its project, or at workspace level. */
export function viewHref(ws: string, view: { id: string }, projectIdentifier: string | null) {
  return projectIdentifier
    ? `/${ws}/p/${projectIdentifier}/views/${view.id}`
    : `/${ws}/views/${view.id}`;
}

/**
 * Create a view from the current filters and display options, or rename an
 * existing one (`existing`).
 */
export function SaveViewDialog({
  ws,
  projectId,
  projectIdentifier,
  filters,
  options,
  existing,
  open,
  onOpenChange,
}: {
  ws: string;
  projectId: string | null;
  projectIdentifier: string | null;
  filters: FilterGroup;
  options: DisplayOptions;
  existing?: {
    id: string;
    name: string;
    description: string | null;
    visibility: "PRIVATE" | "WORKSPACE";
    canShare: boolean;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("views");
  const tc = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [visibility, setVisibility] = useState<"PRIVATE" | "WORKSPACE">(
    existing?.visibility ?? "PRIVATE",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canShare = existing ? existing.canShare : true;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (existing) {
        const res = await updateViewAction(ws, {
          id: existing.id,
          name,
          description: description || null,
          ...(canShare ? { visibility } : {}),
        });
        if (res.ok) onOpenChange(false);
        else setError(t("saveFailed"));
        return;
      }
      const res = await createViewAction(ws, {
        projectId,
        name,
        description: description || null,
        visibility,
        filters,
        displayOptions: options,
      });
      if (res.ok) {
        router.push(viewHref(ws, res.data, projectIdentifier) as never);
        onOpenChange(false);
      } else setError(res.fields?.name?.[0] ?? t("saveFailed"));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{existing ? t("editTitle") : t("saveTitle")}</DialogTitle>
            <DialogDescription>
              {existing ? t("editDescription") : t("saveDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-name">{t("name")}</Label>
              <Input
                id="v-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                aria-invalid={Boolean(error)}
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-desc">{t("description")}</Label>
              <Textarea
                id="v-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-14"
              />
            </div>
            {canShare ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-body font-medium">{t("visibility")}</span>
                <SegmentedControl
                  value={visibility}
                  onValueChange={(v) => setVisibility(v as "PRIVATE" | "WORKSPACE")}
                  label={t("visibility")}
                  className="self-start"
                >
                  <SegmentedControlItem value="PRIVATE">{t("private")}</SegmentedControlItem>
                  <SegmentedControlItem value="WORKSPACE">{t("shared")}</SegmentedControlItem>
                </SegmentedControl>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{tc("cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()}>
              {existing ? tc("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
