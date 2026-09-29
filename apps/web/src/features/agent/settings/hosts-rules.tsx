"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ellipsis, FlaskConical, Plus, Server, Trash } from "lucide-react";
import type { InfraDecision } from "@dopl/shared/domain/agent";
import type { AgentSettings } from "@/server/queries/agent";
import {
  deleteAgentHostAction,
  deleteCommandRuleAction,
  testCommandAction,
  upsertAgentHostAction,
  upsertCommandRuleAction,
} from "@/server/actions/agent";
import { cn } from "@/lib/cn";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsSection } from "@/components/settings/section";
import { EnvBadge } from "../approval-card";
import { Field, selectClass } from "./agent-settings";

type Host = AgentSettings["hosts"][number];
type Rule = AgentSettings["rules"][number];

/* ───────────────────────── hosts ───────────────────────── */

export function HostsSection({ ws, hosts }: { ws: string; hosts: Host[] }) {
  const t = useTranslations("agentSettings.hosts");
  const router = useRouter();
  const [editing, setEditing] = useState<Host | "new" | null>(null);
  return (
    <SettingsSection title={t("title")} description={t("hint")}>
      {hosts.length === 0 ? (
        <EmptyState
          compact
          icon={<Server />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
          {hosts.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-3 py-2.5" data-testid="agent-host">
              <Server className="size-4 shrink-0 text-icon" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-fg">{h.name}</span>
                  <EnvBadge environment={h.environment} />
                  {h.alwaysRequireApproval ? (
                    <span className="text-caption text-fg-muted">{t("alwaysApprove")}</span>
                  ) : null}
                </span>
                <span className="truncate text-small text-fg-muted">
                  {h.hostname} · {t("target", { target: h.warpgateTarget })}
                  {h.description ? ` · ${h.description}` : ""}
                </span>
              </div>
              <Switch
                checked={h.enabled}
                aria-label={t("enabled")}
                onCheckedChange={async (enabled) => {
                  const res = await upsertAgentHostAction(ws, { ...h, enabled });
                  if (res.ok) router.refresh();
                  else toast.error(t("error"));
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t("actions")}>
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(h)}>{t("edit")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    onSelect={async () => {
                      const res = await deleteAgentHostAction(ws, h.id);
                      if (res.ok) router.refresh();
                    }}
                  >
                    <Trash />
                    {t("delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => setEditing("new")}
        data-testid="add-host"
      >
        <Plus />
        {t("add")}
      </Button>
      {editing ? (
        <HostDialog
          key={editing === "new" ? "new" : editing.id}
          ws={ws}
          host={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SettingsSection>
  );
}

function HostDialog({ ws, host, onClose }: { ws: string; host: Host | null; onClose: () => void }) {
  const t = useTranslations("agentSettings.hosts");
  const te = useTranslations("agent.env");
  const router = useRouter();
  const [form, setForm] = useState({
    name: host?.name ?? "",
    hostname: host?.hostname ?? "",
    warpgateTarget: host?.warpgateTarget ?? "",
    environment: host?.environment ?? ("LAB" as Host["environment"]),
    description: host?.description ?? "",
    enabled: host?.enabled ?? true,
    alwaysRequireApproval: host?.alwaysRequireApproval ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{host ? t("editTitle") : t("add")}</DialogTitle>
          <DialogDescription>{t("dialogHint")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="host-name" label={t("name")} hint={t("nameHint")} error={errors.name}>
              <Input
                id="host-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field id="host-env" label={t("environment")}>
              <select
                id="host-env"
                value={form.environment}
                onChange={(e) => {
                  const env = e.target.value as Host["environment"];
                  setForm((f) => ({
                    ...f,
                    environment: env,
                    // Production defaults to "always ask".
                    alwaysRequireApproval: env === "PRODUCTION" ? true : f.alwaysRequireApproval,
                  }));
                }}
                className={selectClass}
              >
                {(["LAB", "STAGING", "PRODUCTION"] as const).map((e) => (
                  <option key={e} value={e}>
                    {te(e)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="host-hostname" label={t("hostname")} error={errors.hostname}>
              <Input
                id="host-hostname"
                value={form.hostname}
                onChange={(e) => set("hostname", e.target.value)}
                className="font-mono"
              />
            </Field>
            <Field
              id="host-target"
              label={t("warpgateTarget")}
              hint={t("warpgateTargetHint")}
              error={errors.warpgateTarget}
            >
              <Input
                id="host-target"
                value={form.warpgateTarget}
                onChange={(e) => set("warpgateTarget", e.target.value)}
                className="font-mono"
              />
            </Field>
          </div>
          <Field id="host-description" label={t("description")}>
            <Input
              id="host-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <label className="flex items-start gap-2 text-body">
            <Checkbox
              className="mt-0.5"
              checked={form.alwaysRequireApproval}
              onCheckedChange={(v) => set("alwaysRequireApproval", v === true)}
            />
            <span className="flex flex-col">
              <span>{t("alwaysApproveLabel")}</span>
              <span className="text-small text-fg-muted">{t("alwaysApproveHint")}</span>
            </span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            loading={pending}
            data-testid="save-host"
            onClick={() =>
              start(async () => {
                const res = await upsertAgentHostAction(ws, {
                  ...(host ? { id: host.id } : {}),
                  ...form,
                  description: form.description || null,
                });
                if (res.ok) {
                  onClose();
                  router.refresh();
                } else if (res.error === "invalid_input") setErrors(res.fields ?? {});
                else if (res.message === "host_name_taken") setErrors({ name: ["taken"] });
                else toast.error(t("error"));
              })
            }
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── rules ───────────────────────── */

export function RulesSection({ ws, rules, hosts }: { ws: string; rules: Rule[]; hosts: Host[] }) {
  const t = useTranslations("agentSettings.rules");
  const [editing, setEditing] = useState<Rule | { kind: Rule["kind"] } | null>(null);
  const hostName = (id: string | null) =>
    id ? (hosts.find((h) => h.id === id)?.name ?? "?") : t("allHosts");
  return (
    <SettingsSection title={t("title")} description={t("hint")}>
      {(["ALLOW_READONLY", "DENY"] as const).map((kind) => {
        const list = rules.filter((r) => r.kind === kind);
        return (
          <div key={kind} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-small font-semibold text-fg">
                {kind === "DENY" ? t("denyTitle") : t("allowTitle")}
              </h3>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setEditing({ kind })}
                data-testid={`add-rule-${kind}`}
              >
                <Plus />
                {t("add")}
              </Button>
            </div>
            <p className="text-small text-fg-muted">
              {kind === "DENY" ? t("denyHint") : t("allowHint")}
            </p>
            {list.length === 0 ? (
              <p className="rounded-control border border-dashed border-border px-3 py-2 text-small text-fg-muted">
                {t("empty")}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
                {list.map((r) => (
                  <RuleRow
                    key={r.id}
                    ws={ws}
                    rule={r}
                    hostName={hostName(r.hostId)}
                    onEdit={() => setEditing(r)}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <RuleTester ws={ws} hosts={hosts} rules={rules} />
      {editing ? (
        <RuleDialog
          key={"id" in editing ? editing.id : `new-${editing.kind}`}
          ws={ws}
          rule={"id" in editing ? editing : null}
          kind={editing.kind}
          hosts={hosts}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SettingsSection>
  );
}

function RuleRow({
  ws,
  rule: r,
  hostName,
  onEdit,
}: {
  ws: string;
  rule: Rule;
  hostName: string;
  onEdit: () => void;
}) {
  const t = useTranslations("agentSettings.rules");
  const router = useRouter();
  return (
    <li
      className={cn("flex items-center gap-3 px-3 py-2", !r.enabled && "opacity-60")}
      data-testid="agent-rule"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <code className="truncate font-mono text-small text-fg">{r.pattern}</code>
        <span className="truncate text-caption text-fg-muted">
          {hostName}
          {r.description ? ` · ${r.description}` : ""}
        </span>
      </div>
      <Switch
        checked={r.enabled}
        aria-label={t("enabled")}
        onCheckedChange={async (enabled) => {
          const res = await upsertCommandRuleAction(ws, { ...r, enabled });
          if (res.ok) router.refresh();
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("actions")}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>{t("edit")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            onSelect={async () => {
              const res = await deleteCommandRuleAction(ws, r.id);
              if (res.ok) router.refresh();
            }}
          >
            <Trash />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function RuleDialog({
  ws,
  rule,
  kind,
  hosts,
  onClose,
}: {
  ws: string;
  rule: Rule | null;
  kind: Rule["kind"];
  hosts: Host[];
  onClose: () => void;
}) {
  const t = useTranslations("agentSettings.rules");
  const router = useRouter();
  const [form, setForm] = useState({
    kind: rule?.kind ?? kind,
    pattern: rule?.pattern ?? "",
    description: rule?.description ?? "",
    hostId: rule?.hostId ?? null,
    enabled: rule?.enabled ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {form.kind === "DENY" ? t("denyDialogTitle") : t("allowDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("patternHelp")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field
            id="rule-pattern"
            label={t("pattern")}
            hint={t("patternHint")}
            error={errors.pattern}
          >
            <Input
              id="rule-pattern"
              value={form.pattern}
              onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
              className="font-mono"
              placeholder={form.kind === "DENY" ? "rm -rf /.*" : "docker ps( -a)?"}
            />
          </Field>
          <Field id="rule-description" label={t("description")}>
            <Input
              id="rule-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field id="rule-host" label={t("host")}>
            <select
              id="rule-host"
              value={form.hostId ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, hostId: e.target.value || null }))}
              className={selectClass}
            >
              <option value="">{t("allHosts")}</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
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
            data-testid="save-rule"
            onClick={() =>
              start(async () => {
                const res = await upsertCommandRuleAction(ws, {
                  ...(rule ? { id: rule.id } : {}),
                  ...form,
                  description: form.description || null,
                });
                if (res.ok) {
                  onClose();
                  router.refresh();
                } else if (res.error === "invalid_input") setErrors(res.fields ?? {});
                else toast.error(t("error"));
              })
            }
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "What would happen to this command on this host?" — the same rules the MCP server uses. */
function RuleTester({ ws, hosts, rules }: { ws: string; hosts: Host[]; rules: Rule[] }) {
  const t = useTranslations("agentSettings.tester");
  const tr = useTranslations("agent.risk");
  const [hostId, setHostId] = useState<string | null>(hosts[0]?.id ?? null);
  const [command, setCommand] = useState("");
  const [tainted, setTainted] = useState(false);
  const [result, setResult] = useState<{
    decision: InfraDecision;
    matchingRuleIds: string[];
  } | null>(null);
  const [pending, start] = useTransition();
  const ruleText = (id?: string) => rules.find((r) => r.id === id)?.pattern ?? "";
  const test = () =>
    start(async () => {
      const res = await testCommandAction(ws, { hostId, command, tainted });
      if (res.ok) setResult(res.data);
    });
  const d = result?.decision;
  return (
    <div
      className="flex flex-col gap-2 rounded-card border border-border bg-surface-muted p-3"
      data-testid="rule-tester"
    >
      <h3 className="flex items-center gap-1.5 text-small font-semibold text-fg">
        <FlaskConical className="size-4 text-icon" aria-hidden />
        {t("title")}
      </h3>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label={t("host")}
          value={hostId ?? ""}
          onChange={(e) => setHostId(e.target.value || null)}
          className={cn(selectClass, "sm:w-40")}
        >
          <option value="">{t("unknownHost")}</option>
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <Input
          aria-label={t("command")}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && command && test()}
          placeholder="docker ps"
          className="flex-1 font-mono"
          data-testid="tester-command"
        />
        <Button
          variant="secondary"
          loading={pending}
          disabled={!command}
          onClick={test}
          data-testid="tester-run"
        >
          {t("test")}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-small text-fg-secondary">
        <Checkbox checked={tainted} onCheckedChange={(v) => setTainted(v === true)} />
        {t("tainted")}
      </label>
      {d ? (
        <div data-testid="tester-result" data-decision={d.decision}>
          {d.decision === "run" ? (
            <Banner tone="success" title={t("runs")}>
              {t("matched", { pattern: ruleText(d.ruleId) })}
            </Banner>
          ) : d.decision === "deny" ? (
            <Banner tone="danger" title={t("refused")}>
              {t(`reason.${d.reason}`)}
              {d.ruleId ? ` (${ruleText(d.ruleId)})` : ""}
            </Banner>
          ) : (
            <Banner tone="warning" title={t("approval")}>
              {d.riskFlags.length ? d.riskFlags.map((f) => tr(f)).join(" · ") : t("noFlags")}
            </Banner>
          )}
        </div>
      ) : null}
    </div>
  );
}
