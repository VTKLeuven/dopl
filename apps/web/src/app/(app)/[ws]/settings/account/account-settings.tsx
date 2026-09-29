"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRelativeTime } from "@/lib/use-relative-time";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Copy, Laptop, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Input, Label, FieldError } from "@/components/ui/input";
import { SettingsSection } from "@/components/settings/section";

interface Props {
  ws: string;
  user: { name: string; email: string };
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  enrollmentRequired: boolean;
}

export function AccountSettings(props: Props) {
  const t = useTranslations("settings.account");
  return (
    <div>
      {props.enrollmentRequired ? (
        <div className="px-5 pt-6 md:px-8">
          <Banner tone="warning" title={t("enrollRequiredTitle")}>
            {t("enrollRequired")}
          </Banner>
        </div>
      ) : null}
      <Profile user={props.user} />
      <SettingsSection title={t("twoFactor")}>
        {props.hasPassword ? (
          <TwoFactor enabled={props.twoFactorEnabled} ws={props.ws} />
        ) : (
          <p className="text-body text-fg-muted">{t("twoFactorNoPassword")}</p>
        )}
      </SettingsSection>
      <Sessions />
    </div>
  );
}

function Profile({ user }: { user: Props["user"] }) {
  const t = useTranslations("settings.account");
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [pending, setPending] = useState(false);
  return (
    <SettingsSection title={t("profile")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const { error } = await authClient.updateUser({ name: name.trim() });
          setPending(false);
          if (!error) {
            toast.success(t("profileSaved"));
            router.refresh();
          }
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acc-name">{t("name")}</Label>
          <Input
            id="acc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="acc-email">{t("email")}</Label>
          <Input id="acc-email" value={user.email} readOnly />
        </div>
        <Button
          type="submit"
          className="self-start"
          loading={pending}
          disabled={!name.trim() || name === user.name}
        >
          {t("saveProfile")}
        </Button>
      </form>
    </SettingsSection>
  );
}

type Step = "idle" | "password" | "scan" | "disable";

function TwoFactor({ enabled, ws }: { enabled: boolean; ws: string }) {
  const t = useTranslations("settings.account");
  const tc = useTranslations("common");
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (totpUri) void QRCode.toDataURL(totpUri, { margin: 1, width: 176 }).then(setQr);
  }, [totpUri]);

  const secret = totpUri ? (new URL(totpUri).searchParams.get("secret") ?? "") : "";

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (res.error || !res.data || res.data.method !== "totp") return setError(t("wrongPassword"));
    setTotpUri(res.data.totpURI);
    setBackupCodes(res.data.backupCodes);
    setStep("scan");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setPending(false);
    if (res.error) return setError(t("wrongPassword"));
    toast.success(t("enabledToast"));
    router.push(`/${ws}/home` as never);
    router.refresh();
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (res.error) return setError(t("wrongPassword"));
    toast(t("disabledToast"));
    setStep("idle");
    router.refresh();
  }

  if (step === "password" || step === "disable") {
    return (
      <form
        className="flex max-w-sm flex-col gap-3"
        onSubmit={step === "password" ? start : disable}
      >
        <Label htmlFor="tf-pw">{t("currentPassword")}</Label>
        <Input
          id="tf-pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="flex gap-2">
          <Button
            type="submit"
            variant={step === "disable" ? "danger" : "primary"}
            loading={pending}
            disabled={!password}
          >
            {step === "disable" ? t("disable") : t("continue")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStep("idle")}>
            {tc("cancel")}
          </Button>
        </div>
      </form>
    );
  }

  if (step === "scan") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex size-[184px] shrink-0 items-center justify-center rounded-card border border-border bg-surface">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="" width={176} height={176} />
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-body font-medium">{t("scanTitle")}</p>
            <p className="text-small text-fg-muted">{t("scanHint")}</p>
            <code className="w-fit rounded-chip border border-border bg-surface-muted px-2 py-1 font-mono text-small tracking-wide">
              {secret}
            </code>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-body font-medium">{t("backupTitle")}</p>
          <p className="text-small text-fg-muted">{t("backupHint")}</p>
          <div className="grid w-fit grid-cols-2 gap-x-6 gap-y-1 rounded-card border border-border bg-surface-muted px-4 py-3 font-mono text-small">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <Button
            size="sm"
            className="self-start"
            onClick={() => void navigator.clipboard.writeText(backupCodes.join("\n"))}
          >
            <Copy />
            {t("copyCodes")}
          </Button>
        </div>
        <form className="flex max-w-sm flex-col gap-2" onSubmit={verify}>
          <Label htmlFor="tf-code">{t("verifyTitle")}</Label>
          <Input
            id="tf-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="tracking-[0.3em] tabular"
          />
          {error ? <FieldError>{error}</FieldError> : null}
          <Button
            type="submit"
            variant="primary"
            className="self-start"
            loading={pending}
            disabled={code.replace(/\s/g, "").length < 6}
          >
            {t("verifyAndEnable")}
          </Button>
        </form>
      </div>
    );
  }

  return enabled ? (
    <div className="flex items-start justify-between gap-4">
      <p className="flex items-start gap-2 text-body text-fg-secondary">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        {t("twoFactorOn")}
      </p>
      <Button variant="danger-ghost" size="sm" onClick={() => setStep("disable")}>
        {t("disable")}
      </Button>
    </div>
  ) : (
    <div className="flex items-start justify-between gap-4">
      <p className="text-body text-fg-muted">{t("twoFactorOff")}</p>
      <Button variant="primary" size="sm" onClick={() => setStep("password")}>
        {t("enable")}
      </Button>
    </div>
  );
}

function Sessions() {
  const t = useTranslations("settings.account");
  const relative = useRelativeTime();
  const queryClient = useQueryClient();
  const { data: current } = authClient.useSession();
  const { data: sessions = [] } = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: async () => (await authClient.listSessions()).data ?? [],
  });
  const reload = () => queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });

  const device = (ua?: string | null) => {
    if (!ua) return t("unknownDevice");
    const browser = /Edg\//.test(ua)
      ? "Edge"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
    const os = /Mac OS X/.test(ua)
      ? "macOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad/.test(ua)
            ? "iOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
    return os ? `${browser} · ${os}` : browser;
  };

  return (
    <SettingsSection title={t("sessions")} description={t("sessionsHint")}>
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
        {sessions.map((s) => {
          const isCurrent = current?.session.token === s.token;
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Laptop className="size-4 text-icon" />
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium">
                  {device(s.userAgent)}
                  {isCurrent ? (
                    <span className="ml-2 rounded-[6px] bg-success-bg px-1.5 py-0.5 text-caption font-medium text-success-text">
                      {t("thisDevice")}
                    </span>
                  ) : null}
                </p>
                <p className="text-small text-fg-muted tabular">
                  {s.ipAddress ? `${s.ipAddress} · ` : ""}
                  {t("lastActive", { time: relative(s.updatedAt) })}
                </p>
              </div>
              {!isCurrent ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={async () => {
                    await authClient.revokeSession({ token: s.token });
                    await reload();
                  }}
                >
                  {t("revoke")}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {sessions.length > 1 ? (
        <Button
          size="sm"
          className="self-start"
          onClick={async () => {
            await authClient.revokeOtherSessions();
            await reload();
          }}
        >
          {t("revokeOthers")}
        </Button>
      ) : null}
    </SettingsSection>
  );
}
