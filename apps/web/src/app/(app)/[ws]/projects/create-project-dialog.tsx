"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { tagColors, type TagColor } from "@dopl/shared/palette";
import { suggestIdentifier } from "@dopl/shared/schemas/project";
import { cn } from "@/lib/cn";
import { tagClasses } from "@/lib/palette";
import { createProjectAction } from "@/server/actions/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input, Label, FieldError, FieldHint, Textarea } from "@/components/ui/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";

export function CreateProjectDialog({
  ws,
  open,
  onOpenChange,
}: {
  ws: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [color, setColor] = useState<TagColor>("blue");
  const [visibility, setVisibility] = useState<"WORKSPACE" | "PRIVATE">("WORKSPACE");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const effectiveIdentifier = identifierTouched ? identifier : name ? suggestIdentifier(name) : "";
  const example = `${effectiveIdentifier || "INFRA"}-42`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await createProjectAction(ws, {
        name,
        identifier: effectiveIdentifier,
        color,
        visibility,
        description,
      });
      if (res.ok) {
        // Navigate first; closing the dialog would rewrite ?new and race the push.
        router.push(`/${ws}/p/${res.data.identifier}/items` as never);
        return;
      }
      if (res.error === "conflict") setErrors({ identifier: t("identifierTaken") });
      else if (res.fields)
        setErrors(Object.fromEntries(Object.entries(res.fields).map(([k, v]) => [k, v[0] ?? ""])));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription", { example })}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-name">{t("name")}</Label>
                <Input
                  id="p-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  autoFocus
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name ? <FieldError>{errors.name}</FieldError> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-ident">{t("identifier")}</Label>
                <Input
                  id="p-ident"
                  value={effectiveIdentifier}
                  onChange={(e) => {
                    setIdentifierTouched(true);
                    setIdentifier(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 10),
                    );
                  }}
                  className="uppercase tabular"
                  aria-invalid={Boolean(errors.identifier)}
                />
              </div>
            </div>
            {errors.identifier ? (
              <FieldError>{errors.identifier}</FieldError>
            ) : (
              <FieldHint>{t("identifierHint", { example })}</FieldHint>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-body font-medium">{t("color")}</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("color")}>
                {tagColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-[8px] border focus-ring transition-shadow",
                      tagClasses[c].pill,
                      color === c && "ring-2 ring-focus ring-offset-1",
                    )}
                  >
                    <span className={cn("size-2.5 rounded-full", tagClasses[c].dot)} />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-body font-medium">{t("visibility")}</span>
              <SegmentedControl
                value={visibility}
                onValueChange={(v) => setVisibility(v as "WORKSPACE" | "PRIVATE")}
                label={t("visibility")}
                className="self-start"
              >
                <SegmentedControlItem value="WORKSPACE">
                  {t("visibilityWorkspace")}
                </SegmentedControlItem>
                <SegmentedControlItem value="PRIVATE">
                  {t("visibilityPrivate")}
                </SegmentedControlItem>
              </SegmentedControl>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-desc">{t("description")}</Label>
              <Textarea
                id="p-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
                className="min-h-16"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{tc("cancel")}</Button>
            </DialogClose>
            <Button
              type="submit"
              variant="primary"
              loading={pending}
              disabled={!name.trim() || !effectiveIdentifier}
            >
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
