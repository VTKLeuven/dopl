"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { addSsoProviderAction, removeSsoProviderAction } from "@/server/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/input";
import { SettingsSection } from "@/components/settings/section";

export function SsoSettings({
  ws,
  providers,
  callbackBase,
}: {
  ws: string;
  providers: Array<{ providerId: string; issuer: string; domain: string }>;
  callbackBase: string;
}) {
  const t = useTranslations("settings.auth");
  const [form, setForm] = useState({
    providerId: "",
    issuer: "",
    domain: "",
    clientId: "",
    clientSecret: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <SettingsSection title={t("ssoTitle")} description={t("ssoHint")}>
      {providers.length === 0 ? (
        <p className="text-body text-fg-muted">{t("none")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {providers.map((p) => (
            <li key={p.providerId} className="flex items-center gap-3 px-4 py-3">
              <KeyRound className="size-4 text-icon" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {p.providerId} · <span className="text-fg-muted">@{p.domain}</span>
                </p>
                <p className="truncate text-small text-fg-muted">{p.issuer}</p>
              </div>
              <Button
                size="xs"
                variant="danger-ghost"
                onClick={() =>
                  startTransition(async () => {
                    await removeSsoProviderAction(ws, p.providerId);
                  })
                }
              >
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-3 rounded-card border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          startTransition(async () => {
            const res = await addSsoProviderAction(ws, form);
            if (res.ok) {
              toast.success(t("saved"));
              setForm({ providerId: "", issuer: "", domain: "", clientId: "", clientSecret: "" });
            } else if (res.fields)
              setErrors(
                Object.fromEntries(Object.entries(res.fields).map(([k, v]) => [k, v[0] ?? ""])),
              );
            else toast.error(res.error);
          });
        }}
      >
        <p className="text-body font-medium">{t("addProvider")}</p>
        {(["providerId", "issuer", "domain", "clientId", "clientSecret"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-1.5">
            <Label htmlFor={`sso-${k}`}>{t(k)}</Label>
            <Input
              id={`sso-${k}`}
              type={k === "clientSecret" ? "password" : "text"}
              value={form[k]}
              onChange={set(k)}
              aria-invalid={Boolean(errors[k])}
            />
            {errors[k] ? (
              <FieldError>{errors[k]}</FieldError>
            ) : k === "providerId" ? (
              <FieldHint>{t("providerIdHint")}</FieldHint>
            ) : null}
          </div>
        ))}
        <FieldHint>
          {t("callbackUrl")}:{" "}
          <code className="font-mono">
            {callbackBase}
            {form.providerId || "<provider-id>"}
          </code>
        </FieldHint>
        <Button type="submit" variant="primary" className="self-start" loading={pending}>
          {t("save")}
        </Button>
      </form>
    </SettingsSection>
  );
}
