"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Mail, ArrowLeft } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { acceptInviteWithPassword } from "@/server/actions/invite";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/input";
import { GoogleIcon } from "@/components/auth/google-icon";

export function InviteForm(props: {
  token: string;
  email: string;
  defaultName: string;
  workspaceName: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
  googleEnabled: boolean;
}) {
  const t = useTranslations("auth");
  const [name, setName] = useState(props.defaultName);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await acceptInviteWithPassword({ token: props.token, name, password });
      if (!res.ok)
        setError(res.error === "invalid_invite" ? t("inviteInvalid") : t("genericError"));
    });
  }

  async function onMagic() {
    const { error } = await authClient.signIn.magicLink({ email: props.email, callbackURL: "/" });
    if (error) setError(t("genericError"));
    else setLinkSent(true);
  }

  if (linkSent) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex size-10 items-center justify-center rounded-card border border-border bg-sky-50 text-sky-700">
          <Mail className="size-5" />
        </div>
        <h1 className="text-title-lg font-semibold">{t("linkSentTitle")}</h1>
        <p className="text-body text-fg-muted">{t("linkSent", { email: props.email })}</p>
        <Button variant="ghost" className="self-start" onClick={() => setLinkSent(false)}>
          <ArrowLeft />
          {t("backToSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-title-lg font-semibold">
          {t("inviteTitle", { workspace: props.workspaceName })}
        </h1>
        <p className="text-body text-fg-muted">
          {t("inviteSubtitle", { role: t(`roles.${props.role}`), email: props.email })}
        </p>
      </div>
      {props.googleEnabled ? (
        <Button
          size="lg"
          onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}
        >
          <GoogleIcon />
          {t("continueWithGoogle")}
        </Button>
      ) : null}
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">{t("yourName")}</Label>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">{t("newPassword")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <FieldHint>{t("newPasswordHint")}</FieldHint>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {t("setPasswordAndJoin")}
        </Button>
      </form>
      <div className="border-t border-border pt-4">
        <Button variant="ghost" size="sm" className="-ml-2.5" onClick={onMagic}>
          <Mail />
          {t("emailMeALinkToJoin")}
        </Button>
      </div>
    </div>
  );
}
