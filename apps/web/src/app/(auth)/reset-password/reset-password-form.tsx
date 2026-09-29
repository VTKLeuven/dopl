"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/input";
import { Banner } from "@/components/ui/banner";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const token = useSearchParams().get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    setState("sent"); // same response whether or not the account exists
  }

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError(t("passwordsDontMatch"));
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
    setPending(false);
    if (error) return setError(error.status === 429 ? t("rateLimited") : t("genericError"));
    setState("done");
  }

  const back = (
    <Link
      href="/sign-in"
      className="inline-flex items-center gap-1.5 text-body text-link hover:underline"
    >
      <ArrowLeft className="size-4" />
      {t("backToSignIn")}
    </Link>
  );

  if (state === "sent") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex size-10 items-center justify-center rounded-card border border-border bg-sky-50 text-sky-700">
          <Mail className="size-5" />
        </div>
        <h1 className="text-title-lg font-semibold">{t("resetSentTitle")}</h1>
        <p className="text-body text-fg-muted">{t("resetSent", { email })}</p>
        {back}
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="success" title={t("passwordUpdated")} />
        {back}
      </div>
    );
  }

  return token ? (
    <form className="flex flex-col gap-4" onSubmit={setNewPassword}>
      <h1 className="text-title-lg font-semibold">{t("resetTitle")}</h1>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw">{t("newPassword")}</Label>
        <Input
          id="pw"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
        <FieldHint>{t("newPasswordHint")}</FieldHint>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw2">{t("confirmPassword")}</Label>
        <Input
          id="pw2"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {t("setPassword")}
      </Button>
      {back}
    </form>
  ) : (
    <form className="flex flex-col gap-4" onSubmit={requestLink}>
      <div className="flex flex-col gap-1">
        <h1 className="text-title-lg font-semibold">{t("resetTitle")}</h1>
        <p className="text-body text-fg-muted">{t("resetHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {t("sendLink")}
      </Button>
      {back}
    </form>
  );
}
