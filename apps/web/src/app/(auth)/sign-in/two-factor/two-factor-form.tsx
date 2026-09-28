"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export function TwoFactorForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, ""), trustDevice: trust });
    if (res.error) {
      setError(res.error.status === 429 ? t("rateLimited") : t("invalidCode"));
      setPending(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <div className="flex size-10 items-center justify-center rounded-card border border-border bg-sky-50 text-sky-700">
        <ShieldCheck className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-title-lg font-semibold">{t("twoFactorTitle")}</h1>
        <p className="text-body text-fg-muted">{t("twoFactorHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">{backup ? t("backupCode") : t("code")}</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={backup ? "text" : "numeric"}
          autoComplete="one-time-code"
          className="tabular text-title tracking-[0.3em]"
          autoFocus
          required
        />
      </div>
      <label className="flex items-center gap-2 text-body text-fg-secondary">
        <Checkbox checked={trust} onCheckedChange={(v) => setTrust(v === true)} />
        {t("trustDevice")}
      </label>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {t("verify")}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="self-start -ml-2.5" onClick={() => { setBackup((b) => !b); setCode(""); }}>
        {backup ? t("useAuthenticator") : t("useBackupCode")}
      </Button>
    </form>
  );
}
