"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateWorkspaceAction } from "@/server/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { SettingsSection } from "@/components/settings/section";

export function GeneralForm(props: { ws: string; name: string; timezone: string; slug: string }) {
  const t = useTranslations("settings.general");
  const [name, setName] = useState(props.name);
  const [timezone, setTimezone] = useState(props.timezone);
  const [pending, startTransition] = useTransition();
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateWorkspaceAction(props.ws, { name, timezone });
          if (res.ok) toast.success(t("saved"));
        });
      }}
    >
      <SettingsSection title={t("title")}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-name">{t("name")}</Label>
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-url">{t("url")}</Label>
          <Input id="ws-url" value={`/${props.slug}`} readOnly />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-tz">{t("timezone")}</Label>
          <select
            id="ws-tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-9 rounded-control border border-border-strong bg-surface px-3 text-body shadow-xs focus-ring"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" className="self-start" loading={pending}>
          {t("save")}
        </Button>
      </SettingsSection>
    </form>
  );
}
