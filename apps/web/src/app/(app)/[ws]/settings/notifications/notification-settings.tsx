"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { NotificationType } from "@dopl/shared/schemas/inbox";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "@/components/settings/section";
import { setNotificationPreferenceAction } from "@/server/actions/inbox";
import type { NotificationPreferences } from "@/server/queries/inbox";

const GROUPS: Array<{
  key: "work" | "messages" | "requests" | "mail" | "agent" | "system";
  types: NotificationType[];
  team?: boolean;
}> = [
  { key: "work", types: ["MENTION", "ASSIGNED", "WORK_ITEM_UPDATED", "COMMENT", "DUE_SOON"] },
  { key: "messages", types: ["THREAD_REPLY"], team: true },
  {
    key: "requests",
    types: ["INTAKE_SUBMITTED", "INTAKE_REPLY", "INTAKE_UPDATED", "SNOOZE_ENDED"],
  },
  { key: "mail", types: ["EMAIL_ASSIGNED", "EMAIL_MENTION", "EMAIL_REPLY"], team: true },
  { key: "agent", types: ["AGENT_APPROVAL_REQUESTED", "AGENT_RUN_FINISHED"], team: true },
  { key: "system", types: ["INTEGRATION_FAILED"], team: true },
];

/**
 * Settings → Notifications: per type, in the Inbox and/or by email. Email
 * goes out as a digest every 10 minutes with whatever is still unread.
 */
export function NotificationSettings({
  ws,
  initial,
  guest,
}: {
  ws: string;
  initial: NotificationPreferences;
  guest: boolean;
}) {
  const t = useTranslations("notificationSettings");
  const [prefs, setPrefs] = useState(initial);

  // A mutation (not a bare action call) so the unsaved-changes guard and
  // <html data-saving> cover the write.
  const save = useMutation({
    mutationFn: async (input: {
      type: NotificationType;
      channel: "inApp" | "email";
      value: boolean;
    }) => {
      const res = await setNotificationPreferenceAction(ws, {
        type: input.type,
        [input.channel]: input.value,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onMutate: ({ type, channel, value }) => {
      const before = prefs[type];
      setPrefs((p) => ({ ...p, [type]: { ...p[type], [channel]: value } }));
      return { before };
    },
    onError: (_err, { type }, context) => {
      if (context) setPrefs((p) => ({ ...p, [type]: context.before }));
      toast.error(t("error"));
    },
  });
  const toggle = (type: NotificationType, channel: "inApp" | "email", value: boolean) =>
    save.mutate({ type, channel, value });

  return (
    <div data-testid="notification-settings">
      <SettingsSection title={t("title")} description={t("description")}>
        <p className="text-small text-fg-muted">{t("digestHint")}</p>
      </SettingsSection>
      {GROUPS.filter((g) => !(guest && g.team)).map((g) => (
        <SettingsSection key={g.key} title={t(`group.${g.key}`)}>
          <div className="overflow-hidden rounded-card border border-border">
            <div className="flex h-9 items-center gap-4 border-b border-border bg-surface-muted px-4 text-caption font-medium text-fg-muted">
              <span className="flex-1">{t("type")}</span>
              <span className="w-14 text-center">{t("inApp")}</span>
              <span className="w-14 text-center">{t("email")}</span>
            </div>
            {g.types.map((type) => (
              <div
                key={type}
                className="flex min-h-12 items-center gap-4 border-b border-border px-4 py-2 last:border-b-0"
                data-testid={`pref-${type}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-fg">{t(`types.${type}.label`)}</p>
                  <p className="text-small text-fg-muted">{t(`types.${type}.hint`)}</p>
                </div>
                <span className="flex w-14 justify-center">
                  <Switch
                    checked={prefs[type].inApp}
                    onCheckedChange={(v) => toggle(type, "inApp", v)}
                    aria-label={t("inAppFor", { type: t(`types.${type}.label`) })}
                  />
                </span>
                <span className="flex w-14 justify-center">
                  <Switch
                    checked={prefs[type].email}
                    onCheckedChange={(v) => toggle(type, "email", v)}
                    aria-label={t("emailFor", { type: t(`types.${type}.label`) })}
                  />
                </span>
              </div>
            ))}
          </div>
        </SettingsSection>
      ))}
    </div>
  );
}
