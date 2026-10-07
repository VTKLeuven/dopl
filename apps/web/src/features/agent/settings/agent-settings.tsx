"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bot, Copy, ImageUp, KeyRound, PlugZap, Plus } from "lucide-react";
import { AVATAR_MAX_BYTES } from "@dopl/shared/domain/avatar";
import { MCP_SCOPES, type McpScope } from "@dopl/shared/domain/agent";
import type { AgentSettings } from "@/server/queries/agent";
import type { ConnectionCheck } from "@/server/services/agent";
import {
  checkAgentConnectionAction,
  createAgentAction,
  createMcpTokenAction,
  revokeMcpTokenAction,
  setAgentApprovalsSkippedAction,
  setAgentPausedAction,
  setAgentStatusAction,
  updateAgentProfileAction,
} from "@/server/actions/agent";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { AgentAvatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsSection } from "@/components/settings/section";
import { HostsSection, RulesSection } from "./hosts-rules";

export const selectClass =
  "h-9 rounded-control border border-border-strong bg-surface px-3 text-body shadow-xs focus-ring";

/** Settings → AI teammate (Phase 8): profile, kill switch, approvals, hosts, rules, MCP tokens. */
export function AgentSettingsView({
  ws,
  settings,
  appUrl,
}: {
  ws: string;
  settings: AgentSettings;
  appUrl: string;
}) {
  const t = useTranslations("agentSettings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!settings.agent || !settings.profile)
    return (
      <SettingsSection title={t("title")} description={t("intro")}>
        <EmptyState
          icon={<Bot />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Button
              variant="primary"
              loading={pending}
              data-testid="add-agent"
              onClick={() =>
                startTransition(async () => {
                  const res = await createAgentAction(ws);
                  if (res.ok) router.refresh();
                  else toast.error(t("errors.generic"));
                })
              }
            >
              <Plus />
              {t("add")}
            </Button>
          }
        />
      </SettingsSection>
    );

  return (
    <>
      <ProfileSection ws={ws} settings={settings} />
      <PauseSection ws={ws} paused={settings.paused} />
      <ApprovalsSection ws={ws} skipApprovals={settings.profile.skipApprovals} />
      <HostsSection ws={ws} hosts={settings.hosts} skipApprovals={settings.profile.skipApprovals} />
      <RulesSection ws={ws} rules={settings.rules} hosts={settings.hosts} />
      <TokensSection ws={ws} settings={settings} appUrl={appUrl} />
    </>
  );
}

function CheckResult({ check }: { check: ConnectionCheck }) {
  const t = useTranslations("agentSettings.check");
  const relative = useRelativeTime();
  return (
    <Banner
      tone={check.ok ? "success" : "danger"}
      title={check.ok ? t("ok", { model: check.model ?? "?" }) : t("failed")}
    >
      <span suppressHydrationWarning>
        {check.error
          ? check.error === "worker_timeout"
            ? t("workerTimeout")
            : check.error
          : check.missing.length
            ? t("missing", { features: check.missing.join(", ") })
            : check.approvals
              ? t("approvalsOk")
              : t("approvalsMissing")}
        {" · "}
        {relative(check.at)}
      </span>
    </Banner>
  );
}

/** Upload or remove the agent's picture (D-133); the route checks type and size again. */
function AvatarControls({ ws, hasImage }: { ws: string; hasImage: boolean }) {
  const t = useTranslations("agentSettings.picture");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function send(init: RequestInit, done: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/${ws}/agent/avatar`, init);
      if (res.ok) {
        toast.success(done);
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      toast.error(
        body.message === "too_large"
          ? t("tooLarge")
          : body.message === "not_an_image"
            ? t("invalid")
            : t("failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="agent-avatar-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > AVATAR_MAX_BYTES) return void toast.error(t("tooLarge"));
          const form = new FormData();
          form.set("file", file);
          void send({ method: "POST", body: form }, t("saved"));
        }}
      />
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="-ml-2"
        loading={busy}
        onClick={() => input.current?.click()}
      >
        <ImageUp />
        {hasImage ? t("change") : t("upload")}
      </Button>
      {hasImage ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => void send({ method: "DELETE" }, t("removed"))}
        >
          {t("remove")}
        </Button>
      ) : null}
    </div>
  );
}

function ProfileSection({ ws, settings }: { ws: string; settings: AgentSettings }) {
  const t = useTranslations("agentSettings");
  const router = useRouter();
  const p = settings.profile!;
  const [form, setForm] = useState({
    name: settings.agent!.name,
    baseUrl: p.baseUrl,
    apiKeyEnv: p.apiKeyEnv,
    model: p.model ?? "",
    instructions: p.instructions ?? "",
    runTimeoutMin: Math.round(p.runTimeoutSec / 60),
    approvalTimeoutMin: Math.round(p.approvalTimeoutSec / 60),
    contextBudgetChars: p.contextBudgetChars,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, startSave] = useTransition();
  const [checking, startCheck] = useTransition();
  const [check, setCheck] = useState<ConnectionCheck | null>(p.lastCheck);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const active = p.status === "ACTIVE";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startSave(async () => {
          const res = await updateAgentProfileAction(ws, {
            name: form.name,
            baseUrl: form.baseUrl,
            apiKeyEnv: form.apiKeyEnv,
            model: form.model || null,
            instructions: form.instructions || null,
            runTimeoutSec: form.runTimeoutMin * 60,
            approvalTimeoutSec: form.approvalTimeoutMin * 60,
            contextBudgetChars: form.contextBudgetChars,
          });
          if (res.ok) {
            setErrors({});
            toast.success(t("saved"));
            router.refresh();
          } else if (res.error === "invalid_input") setErrors(res.fields ?? {});
          else toast.error(t("errors.generic"));
        });
      }}
    >
      <SettingsSection title={t("title")} description={t("intro")}>
        <div className="flex items-center gap-3 rounded-card border border-border p-3">
          <AgentAvatar size="lg" name={settings.agent!.name} image={settings.agent!.image} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium text-fg">{settings.agent!.name}</span>
            <span className="text-small text-fg-muted">
              {active ? t("statusActive") : t("statusDisabled")}
            </span>
            <AvatarControls ws={ws} hasImage={Boolean(settings.agent!.image)} />
          </div>
          <Switch
            checked={active}
            aria-label={t("enabled")}
            data-testid="agent-enabled"
            onCheckedChange={async (on) => {
              const res = await setAgentStatusAction(ws, { status: on ? "ACTIVE" : "DISABLED" });
              if (res.ok) router.refresh();
              else toast.error(t("errors.generic"));
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="agent-name" label={t("name")} error={errors.name}>
            <Input
              id="agent-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field id="agent-model" label={t("model")} hint={t("modelHint")} error={errors.model}>
            <Input
              id="agent-model"
              value={form.model}
              placeholder="qwen3.8-27b"
              onChange={(e) => set("model", e.target.value)}
            />
          </Field>
          <Field id="agent-url" label={t("baseUrl")} hint={t("baseUrlHint")} error={errors.baseUrl}>
            <Input
              id="agent-url"
              value={form.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              className="font-mono"
            />
          </Field>
          <Field
            id="agent-key"
            label={t("apiKeyEnv")}
            hint={t("apiKeyEnvHint")}
            error={errors.apiKeyEnv}
          >
            <Input
              id="agent-key"
              value={form.apiKeyEnv}
              onChange={(e) => set("apiKeyEnv", e.target.value.toUpperCase())}
              className="font-mono"
            />
          </Field>
        </div>
        <Field
          id="agent-instructions"
          label={t("instructions")}
          hint={t("instructionsHint")}
          error={errors.instructions}
        >
          <Textarea
            id="agent-instructions"
            rows={4}
            value={form.instructions}
            onChange={(e) => set("instructions", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="agent-run-timeout" label={t("runTimeout")} error={errors.runTimeoutSec}>
            <Input
              id="agent-run-timeout"
              type="number"
              min={1}
              max={240}
              value={form.runTimeoutMin}
              onChange={(e) => set("runTimeoutMin", Number(e.target.value))}
            />
          </Field>
          <Field
            id="agent-approval-timeout"
            label={t("approvalTimeout")}
            error={errors.approvalTimeoutSec}
          >
            <Input
              id="agent-approval-timeout"
              type="number"
              min={1}
              max={1440}
              value={form.approvalTimeoutMin}
              onChange={(e) => set("approvalTimeoutMin", Number(e.target.value))}
            />
          </Field>
          <Field
            id="agent-budget"
            label={t("contextBudget")}
            hint={t("contextBudgetHint")}
            error={errors.contextBudgetChars}
          >
            <Input
              id="agent-budget"
              type="number"
              min={2000}
              max={400000}
              step={1000}
              value={form.contextBudgetChars}
              onChange={(e) => set("contextBudgetChars", Number(e.target.value))}
            />
          </Field>
        </div>
        {check ? <CheckResult check={check} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={saving}>
            {t("save")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={checking}
            data-testid="agent-check"
            onClick={() =>
              startCheck(async () => {
                const res = await checkAgentConnectionAction(ws);
                if (res.ok) setCheck(res.data);
                else toast.error(t("errors.generic"));
              })
            }
          >
            <PlugZap />
            {t("checkConnection")}
          </Button>
        </div>
      </SettingsSection>
    </form>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string[];
  children: React.ReactNode;
}) {
  const t = useTranslations("agentSettings.fieldError");
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error?.length ? (
        <p className="text-small text-danger-text">
          {error[0] === "invalid" || error[0] === "too_broad" || error[0] === "taken"
            ? t(error[0])
            : t("generic")}
        </p>
      ) : hint ? (
        <FieldHint>{hint}</FieldHint>
      ) : null}
    </div>
  );
}

function PauseSection({ ws, paused }: { ws: string; paused: AgentSettings["paused"] }) {
  const t = useTranslations("agentSettings.pause");
  const router = useRouter();
  const relative = useRelativeTime();
  const [busy, setBusy] = useState(false);
  return (
    <SettingsSection title={t("title")} description={t("hint")}>
      <label className="flex items-center gap-3 rounded-card border border-border p-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-fg">{paused ? t("on") : t("off")}</span>
          <span className="text-small text-fg-muted" suppressHydrationWarning>
            {paused
              ? t("since", { name: paused.by ?? "?", when: relative(paused.at) })
              : t("offHint")}
          </span>
        </span>
        <Switch
          checked={Boolean(paused)}
          disabled={busy}
          data-testid="settings-agent-pause"
          onCheckedChange={async (on) => {
            setBusy(true);
            const res = await setAgentPausedAction(ws, { paused: on });
            setBusy(false);
            if (res.ok) router.refresh();
            else toast.error(t("error"));
          }}
        />
      </label>
    </SettingsSection>
  );
}

/**
 * "Skip approvals" (D-140): Dopl stops asking for anything. Turning it on
 * asks once, here, because it also drops the prompt-injection boundary.
 */
function ApprovalsSection({ ws, skipApprovals }: { ws: string; skipApprovals: boolean }) {
  const t = useTranslations("agentSettings.approvals");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const save = async (on: boolean) => {
    setBusy(true);
    const res = await setAgentApprovalsSkippedAction(ws, { skipApprovals: on });
    setBusy(false);
    if (res.ok) router.refresh();
    else toast.error(t("error"));
  };
  return (
    <SettingsSection title={t("title")} description={t("hint")}>
      <label className="flex items-center gap-3 rounded-card border border-border p-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-fg">{skipApprovals ? t("on") : t("off")}</span>
          <span className="text-small text-fg-muted">
            {skipApprovals ? t("onHint") : t("offHint")}
          </span>
        </span>
        <Switch
          checked={skipApprovals}
          disabled={busy}
          data-testid="settings-agent-skip-approvals"
          onCheckedChange={(on) => (on ? setConfirming(true) : void save(false))}
        />
      </label>
      {skipApprovals ? (
        <Banner tone="danger" title={t("bannerTitle")}>
          {t("bannerBody")}
        </Banner>
      ) : null}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>{t("confirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-small text-fg-secondary">
              <li>{t("confirmCommands")}</li>
              <li>{t("confirmUntrusted")}</li>
              <li>{t("confirmKept")}</li>
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              data-testid="confirm-skip-approvals"
              onClick={async () => {
                await save(true);
                setConfirming(false);
              }}
            >
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

function TokensSection({
  ws,
  settings,
  appUrl,
}: {
  ws: string;
  settings: AgentSettings;
  appUrl: string;
}) {
  const t = useTranslations("agentSettings.tokens");
  const relative = useRelativeTime();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const live = settings.tokens.filter((x) => !x.revokedAt);
  const mcpUrl = `${appUrl.replace(/\/$/, "")}/api/mcp`;
  return (
    <SettingsSection title={t("title")} description={t("hint")}>
      {live.length === 0 ? (
        <p className="text-small text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
          {live.map((tok) => (
            <li
              key={tok.id}
              className="flex items-center gap-3 px-3 py-2.5"
              data-testid="mcp-token"
            >
              <KeyRound className="size-4 shrink-0 text-icon" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-fg">{tok.name}</span>
                <span className="truncate text-small text-fg-muted" suppressHydrationWarning>
                  <span className="font-mono">{tok.tokenPrefix}…</span>
                  {" · "}
                  {tok.scopes.length === MCP_SCOPES.length ? t("allScopes") : tok.scopes.join(", ")}
                  {" · "}
                  {tok.projectIds.length
                    ? t("projects", { count: tok.projectIds.length })
                    : t("allProjects")}
                  {" · "}
                  {tok.lastUsedAt
                    ? t("lastUsed", { when: relative(tok.lastUsedAt) })
                    : t("neverUsed")}
                  {tok.expiresAt ? ` · ${t("expires", { when: relative(tok.expiresAt) })}` : ""}
                </span>
              </div>
              <Button
                variant="danger-ghost"
                size="xs"
                onClick={async () => {
                  const res = await revokeMcpTokenAction(ws, tok.id);
                  if (res.ok) {
                    toast(t("revoked"));
                    router.refresh();
                  }
                }}
              >
                {t("revoke")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => setCreating(true)}
        data-testid="add-token"
      >
        <Plus />
        {t("create")}
      </Button>
      <details className="rounded-control border border-border bg-surface-muted px-3 py-2">
        <summary className="cursor-pointer text-small font-medium text-fg-secondary">
          {t("hermesConfig")}
        </summary>
        <pre className="mt-2 overflow-x-auto font-mono text-caption text-fg-secondary">{`mcp_servers:
  dopl:
    url: "${mcpUrl}"
    headers:
      Authorization: "Bearer <token>"
    timeout: 900
    connect_timeout: 30
agent:
  disabled_toolsets: [terminal, code_execution, file, browser]
approvals:
  mode: manual`}</pre>
      </details>
      {creating ? (
        <TokenDialog
          ws={ws}
          projects={settings.projects}
          onClose={() => setCreating(false)}
          onCreated={(token) => {
            setCreating(false);
            setCreated(token);
            router.refresh();
          }}
        />
      ) : null}
      <Dialog open={Boolean(created)} onOpenChange={(o) => (o ? null : setCreated(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createdTitle")}</DialogTitle>
            <DialogDescription>{t("createdBody")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex items-center gap-2">
              <Input readOnly value={created ?? ""} className="font-mono" data-testid="new-token" />
              <Button
                variant="secondary"
                size="icon"
                aria-label={t("copy")}
                onClick={async () => {
                  await navigator.clipboard.writeText(created ?? "");
                  toast(t("copied"));
                }}
              >
                <Copy />
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="primary" onClick={() => setCreated(null)}>
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

function TokenDialog({
  ws,
  projects,
  onClose,
  onCreated,
}: {
  ws: string;
  projects: AgentSettings["projects"];
  onClose: () => void;
  onCreated: (token: string) => void;
}) {
  const t = useTranslations("agentSettings.tokens");
  const ts = useTranslations("agentSettings.scope");
  const [name, setName] = useState("Hermes");
  const [scopes, setScopes] = useState<McpScope[]>([...MCP_SCOPES]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [expires, setExpires] = useState<string>("");
  const [pending, start] = useTransition();
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create")}</DialogTitle>
          <DialogDescription>{t("createHint")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field id="token-name" label={t("name")}>
            <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-small font-medium text-fg">{t("scopes")}</legend>
            {MCP_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-body">
                <Checkbox
                  checked={scopes.includes(s)}
                  onCheckedChange={() => setScopes((x) => toggle(x, s))}
                />
                <span>{ts(s.replace(/[:]/g, "_") as "work_items_read")}</span>
                <span className="font-mono text-caption text-fg-muted">{s}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-small font-medium text-fg">{t("projectLimit")}</legend>
            <p className="text-small text-fg-muted">{t("projectLimitHint")}</p>
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-body">
                  <Checkbox
                    checked={projectIds.includes(p.id)}
                    onCheckedChange={() => setProjectIds((x) => toggle(x, p.id))}
                  />
                  <span className="font-medium text-fg-muted tabular">{p.identifier}</span>
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="token-expiry" label={t("expiry")}>
            <select
              id="token-expiry"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={cn(selectClass)}
            >
              <option value="">{t("never")}</option>
              <option value="30">{t("days", { count: 30 })}</option>
              <option value="90">{t("days", { count: 90 })}</option>
              <option value="365">{t("days", { count: 365 })}</option>
            </select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!name.trim() || scopes.length === 0}
            data-testid="create-token"
            onClick={() =>
              start(async () => {
                const res = await createMcpTokenAction(ws, {
                  name,
                  scopes,
                  projectIds,
                  expiresInDays: expires ? Number(expires) : null,
                });
                if (res.ok) onCreated(res.data.token);
                else toast.error(t("error"));
              })
            }
          >
            {t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
