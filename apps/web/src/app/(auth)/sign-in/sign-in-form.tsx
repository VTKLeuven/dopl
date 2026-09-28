"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { GoogleIcon } from "@/components/auth/google-icon";

type Mode = "password" | "magic" | "sso" | "magic-sent";

function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function fail(status?: number) {
    setError(status === 429 ? t("rateLimited") : t("genericError"));
    setPending(false);
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password, callbackURL: next });
    if (error) return fail(error.status);
    router.push(next as never);
    router.refresh();
  }

  async function onMagic(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
    if (error) return fail(error.status);
    setPending(false);
    setMode("magic-sent");
  }

  async function onSso(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.sso({ email, callbackURL: next });
    if (error) return fail(error.status);
  }

  async function onGoogle() {
    setPending(true);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: next });
    if (error) fail(error.status);
  }

  if (mode === "magic-sent") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex size-10 items-center justify-center rounded-card border border-border bg-sky-50 text-sky-700">
          <Mail className="size-5" />
        </div>
        <h1 className="text-title-lg font-semibold">{t("linkSentTitle")}</h1>
        <p className="text-body text-fg-muted">{t("linkSent", { email })}</p>
        <Button variant="ghost" className="mt-2 self-start" onClick={() => setMode("password")}>
          <ArrowLeft />
          {t("backToSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-title-lg font-semibold">{mode === "sso" ? t("ssoTitle") : t("signInTitle")}</h1>
        <p className="text-body text-fg-muted">{mode === "sso" ? t("ssoHint") : t("signInSubtitle")}</p>
      </div>

      {mode === "password" && googleEnabled ? (
        <>
          <Button size="lg" onClick={onGoogle} disabled={pending}>
            <GoogleIcon />
            {t("continueWithGoogle")}
          </Button>
          <div className="flex items-center gap-3 text-caption text-fg-muted">
            <span className="h-px flex-1 bg-border" />
            {t("or")}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form
        className="flex flex-col gap-4"
        onSubmit={mode === "password" ? onPassword : mode === "magic" ? onMagic : onSso}
        noValidate
      >
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
        {mode === "password" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("password")}</Label>
              <a href="/reset-password" className="text-small text-link hover:underline">
                {t("forgotPassword")}
              </a>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {mode === "password" ? t("signIn") : mode === "magic" ? t("sendLink") : t("ssoContinue")}
        </Button>
      </form>

      <div className="flex flex-col items-start gap-1 border-t border-border pt-4">
        {mode !== "magic" ? (
          <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => { setMode("magic"); setError(null); }}>
            <Mail />
            {t("emailMeALink")}
          </Button>
        ) : null}
        {mode !== "sso" ? (
          <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => { setMode("sso"); setError(null); }}>
            <KeyRound />
            {t("continueWithSso")}
          </Button>
        ) : null}
        {mode !== "password" ? (
          <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => { setMode("password"); setError(null); }}>
            <ArrowLeft />
            {t("usePassword")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
