"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Lock,
  Mail,
  Pause,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Unplug,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import type { ActionResult } from "@/server/action-result";
import {
  connectPersonalMailboxAction,
  createMailboxAction,
  setMailboxStateAction,
  syncMailboxNowAction,
  updateMailboxAction,
} from "@/server/actions/mail";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
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
import { SettingsSection } from "@/components/settings/section";
import { Picker } from "@/features/work-items/pickers";
import { IgnoreRules } from "./ignore-rules";
import type { MailboxAdmin, MailboxSummary, Person } from "./types";

type Status = MailboxSummary["status"];

/** Colour by what the admin should do: nothing (active), wait, or fix. */
export function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations("mailboxes.status");
  const tone =
    status === "ACTIVE"
      ? "border-success-border bg-success-bg text-success-text"
      : status === "ERROR"
        ? "border-danger-border bg-danger-bg text-danger-text"
        : status === "CONNECTING" || status === "BACKFILLING"
          ? "border-info-border bg-info-bg text-info-text"
          : "border-border bg-surface-muted text-fg-muted";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-chip border px-2 text-small font-medium",
        tone,
      )}
      data-testid="mailbox-status"
      data-status={status}
    >
      {t(status)}
    </span>
  );
}

async function run<T>(p: Promise<ActionResult<T>>, onError: (code: string) => void) {
  const res = await p;
  if (!res.ok) {
    onError(res.error);
    return null;
  }
  return res.data;
}

function useErrors() {
  const t = useTranslations("mailboxes.errors");
  return (code: string) =>
    toast.error(
      code === "mailbox_exists"
        ? t("exists")
        : code === "mailbox_shared"
          ? t("shared")
          : code === "email_unverified"
            ? t("unverified")
            : code === "invalid_member"
              ? t("invalidMember")
              : code === "invalid_input"
                ? t("invalidInput")
                : t("generic"),
    );
}

/* ───────────────────────── list ───────────────────────── */

interface ListRow {
  id: string;
  emailAddress: string;
  displayName: string | null;
  status: Status;
  lastSyncedAt: string | null;
  syncError: string | null;
  members: number;
  threads: number;
}

export function MailboxesSettings({
  ws,
  mailboxes,
  people,
}: {
  ws: string;
  mailboxes: ListRow[];
  people: Person[];
}) {
  const t = useTranslations("mailboxes");
  const relative = useRelativeTime();
  const [connecting, setConnecting] = useState(false);
  return (
    <div>
      <SettingsSection title={t("title")} description={t("description")}>
        {mailboxes.length === 0 ? (
          <EmptyState
            compact
            icon={<Mail />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button
                variant="primary"
                onClick={() => setConnecting(true)}
                data-testid="connect-mailbox"
              >
                <Plus />
                {t("connect")}
              </Button>
            }
          />
        ) : (
          <>
            <ul
              className="overflow-hidden rounded-card border border-border"
              data-testid="mailbox-list"
            >
              {mailboxes.map((m) => (
                <li key={m.id} className="border-b border-border last:border-0">
                  <Link
                    href={`/${ws}/settings/mailboxes/${m.id}` as never}
                    className="flex items-center gap-3 px-4 py-3 focus-ring hover:bg-surface-hover"
                  >
                    <Mail className="size-4 shrink-0 text-icon" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium text-fg">
                        {m.displayName ?? m.emailAddress}
                      </span>
                      <span className="block truncate text-small text-fg-muted">
                        {m.displayName ? `${m.emailAddress} · ` : ""}
                        {t("summary", { members: m.members, threads: m.threads })}
                        {m.lastSyncedAt
                          ? ` · ${t("synced", { when: relative(m.lastSyncedAt) })}`
                          : ""}
                      </span>
                    </span>
                    <StatusBadge status={m.status} />
                    <ChevronRight className="size-4 text-icon" />
                  </Link>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => setConnecting(true)}
              data-testid="connect-mailbox"
            >
              <Plus />
              {t("connect")}
            </Button>
          </>
        )}
      </SettingsSection>
      <SettingsSection title={t("setupTitle")} description={t("setupDescription")}>
        <ul className="list-disc pl-5 text-small text-fg-secondary">
          <li>{t("setup.delegation")}</li>
          <li>{t("setup.pubsub")}</li>
          <li>{t("setup.groups")}</li>
        </ul>
        <p className="text-small text-fg-muted">{t("setup.guide")}</p>
      </SettingsSection>
      <ConnectDialog
        ws={ws}
        open={connecting}
        onClose={() => setConnecting(false)}
        people={people}
      />
    </div>
  );
}

function PeoplePicker({
  people,
  value,
  onChange,
  multi = false,
  placeholder,
  testId,
}: {
  people: Person[];
  value: string[];
  onChange: (ids: string[]) => void;
  multi?: boolean;
  placeholder: string;
  testId?: string;
}) {
  const chosen = people.filter((p) => value.includes(p.id));
  return (
    <Picker
      multi={multi}
      placeholder={placeholder}
      options={people.map((p) => ({
        value: p.id,
        label: p.name,
        icon: <Avatar user={p} size="xs" />,
      }))}
      selected={value}
      onChange={onChange}
      trigger={
        <Button variant="secondary" className="justify-start" data-testid={testId}>
          {chosen.length ? (
            <span className="flex -space-x-1">
              {chosen.slice(0, 4).map((p) => (
                <Avatar key={p.id} user={p} size="xs" />
              ))}
            </span>
          ) : (
            <UserRound />
          )}
          <span className="min-w-0 flex-1 truncate text-left">
            {chosen.length ? chosen.map((p) => p.name).join(", ") : placeholder}
          </span>
          <ChevronDown />
        </Button>
      }
    />
  );
}

function ConnectDialog({
  ws,
  open,
  onClose,
  people,
}: {
  ws: string;
  open: boolean;
  onClose: () => void;
  people: Person[];
}) {
  const t = useTranslations("mailboxes.connectDialog");
  const router = useRouter();
  const onError = useErrors();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const r = await run(
      createMailboxAction(ws, {
        emailAddress: email,
        displayName: name.trim() || null,
        backfillDays: Number(days) || 90,
        memberIds: members,
      }),
      onError,
    );
    setBusy(false);
    if (r) {
      onClose();
      router.push(`/${ws}/settings/mailboxes/${r.id}` as never);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md" data-testid="connect-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-fg-secondary">{t("email")}</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="it-inbox@vtk.be"
              autoFocus
            />
            <span className="text-small text-fg-muted">{t("emailHint")}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-fg-secondary">{t("name")}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-fg-secondary">{t("backfill")}</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-32"
            />
            <span className="text-small text-fg-muted">{t("backfillHint")}</span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-fg-secondary">{t("members")}</span>
            <PeoplePicker
              people={people}
              value={members}
              onChange={setMembers}
              multi
              placeholder={t("membersPlaceholder")}
              testId="connect-members"
            />
            <span className="text-small text-fg-muted">{t("membersHint")}</span>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            loading={busy}
            disabled={!email.includes("@")}
            data-testid="connect-submit"
          >
            <Plug />
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── one mailbox ───────────────────────── */

export function MailboxStatus({
  ws,
  mailbox,
  people,
}: {
  ws: string;
  mailbox: MailboxAdmin;
  people: Person[];
}) {
  const t = useTranslations("mailboxes");
  const fmt = useFormatter();
  const relative = useRelativeTime();
  const router = useRouter();
  const onError = useErrors();
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState(mailbox.displayName ?? "");
  const [members, setMembers] = useState(mailbox.members.map((m) => m.id));
  const [assignee, setAssignee] = useState<string[]>(
    mailbox.defaultAssigneeId ? [mailbox.defaultAssigneeId] : [],
  );

  const act = async (key: string, p: Promise<ActionResult<unknown>>, done?: string) => {
    setBusy(key);
    const ok = await run(p, onError);
    setBusy(null);
    if (ok) {
      if (done) toast.success(done);
      router.refresh();
    }
  };
  const statLine = (stats: Record<string, unknown>) => {
    const n = (k: string) => Number(stats[k] ?? 0);
    const parts: string[] = [];
    if ("created" in stats) parts.push(t("stat.created", { n: n("created") }));
    if ("updated" in stats) parts.push(t("stat.updated", { n: n("updated") }));
    if ("labels" in stats) parts.push(t("stat.labels", { n: n("labels") }));
    if ("pages" in stats) parts.push(t("stat.pages", { n: n("pages") }));
    if ("durationMs" in stats) parts.push(t("stat.durationMs", { n: n("durationMs") }));
    return parts.join(" · ");
  };
  const when = (iso: string | null) =>
    iso ? fmt.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : t("never");

  return (
    <div data-testid="mailbox-page">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-5 md:px-8">
        {mailbox.personal ? (
          <Lock className="size-4 text-icon" />
        ) : (
          <>
            <Link
              href={`/${ws}/settings/mailboxes` as never}
              className="text-small text-fg-muted hover:text-fg"
            >
              {t("title")}
            </Link>
            <ChevronRight className="size-4 text-icon" />
          </>
        )}
        <h1 className="text-title font-semibold text-fg">
          {mailbox.displayName ?? mailbox.emailAddress}
        </h1>
        <StatusBadge status={mailbox.status} />
      </div>

      {mailbox.status === "ERROR" && mailbox.syncError ? (
        <div className="px-5 pt-5 md:px-8">
          <Banner tone="danger" title={t("errorTitle")}>
            {mailbox.syncError}
          </Banner>
        </div>
      ) : null}

      <SettingsSection title={t("sync")} description={t("syncDescription")}>
        <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-body">
          <dt className="text-fg-muted">{t("address")}</dt>
          <dd className="text-fg">{mailbox.emailAddress}</dd>
          <dt className="text-fg-muted">{t("lastSynced")}</dt>
          <dd className="text-fg" data-testid="last-synced">
            {mailbox.lastSyncedAt ? relative(mailbox.lastSyncedAt) : t("never")}
          </dd>
          <dt className="text-fg-muted">{t("backfillDone")}</dt>
          <dd className="text-fg">{when(mailbox.backfillCompletedAt)}</dd>
          <dt className="text-fg-muted">{t("push")}</dt>
          <dd className="text-fg">
            {mailbox.watchExpiresAt
              ? t("pushUntil", { when: when(mailbox.watchExpiresAt) })
              : t("pushOff")}
          </dd>
          {mailbox.syncError && mailbox.status !== "ERROR" ? (
            <>
              <dt className="text-fg-muted">{t("lastError")}</dt>
              <dd className="text-danger-text">{mailbox.syncError}</dd>
            </>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={busy === "test"}
            onClick={() =>
              void act("test", setMailboxStateAction(ws, mailbox.id, "test"), t("testQueued"))
            }
            data-testid="mailbox-test"
          >
            <Plug />
            {t("test")}
          </Button>
          <Button
            variant="secondary"
            loading={busy === "sync"}
            disabled={mailbox.status !== "ACTIVE"}
            onClick={() => void act("sync", syncMailboxNowAction(ws, mailbox.id), t("syncQueued"))}
          >
            <RefreshCw />
            {t("syncNow")}
          </Button>
          {mailbox.status === "PAUSED" ? (
            <Button
              variant="secondary"
              loading={busy === "resume"}
              onClick={() => void act("resume", setMailboxStateAction(ws, mailbox.id, "resume"))}
            >
              <Play />
              {t("resume")}
            </Button>
          ) : (
            <Button
              variant="secondary"
              loading={busy === "pause"}
              onClick={() => void act("pause", setMailboxStateAction(ws, mailbox.id, "pause"))}
            >
              <Pause />
              {t("pause")}
            </Button>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings")}
        description={
          mailbox.personal ? t("personal.settingsDescription") : t("settingsDescription")
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-fg-secondary">
            {t("connectDialog.name")}
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={mailbox.emailAddress}
          />
        </label>
        {/* A personal mailbox has no members, and its mail is its owner's (D-138). */}
        {mailbox.personal ? null : (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-fg-secondary">
                {t("connectDialog.members")}
              </span>
              <PeoplePicker
                people={people}
                value={members}
                onChange={setMembers}
                multi
                placeholder={t("connectDialog.membersPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-fg-secondary">
                {t("defaultAssignee")}
              </span>
              <PeoplePicker
                people={people}
                value={assignee}
                onChange={(ids) => setAssignee(ids.slice(-1))}
                placeholder={t("nobody")}
              />
              <span className="text-small text-fg-muted">{t("defaultAssigneeHint")}</span>
            </div>
          </>
        )}
        <label className="flex items-start justify-between gap-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-body font-medium text-fg">{t("sendEnabled")}</span>
            <span className="text-small text-fg-muted">{t("sendEnabledHint")}</span>
          </span>
          <Switch
            checked={mailbox.sendEnabled}
            onCheckedChange={(v) =>
              void act("send", updateMailboxAction(ws, { id: mailbox.id, sendEnabled: v }))
            }
            data-testid="mailbox-send-enabled"
          />
        </label>
        <Button
          variant="primary"
          className="self-start"
          loading={busy === "save"}
          onClick={() =>
            void act(
              "save",
              updateMailboxAction(ws, {
                id: mailbox.id,
                displayName: name.trim() || null,
                ...(mailbox.personal
                  ? {}
                  : { memberIds: members, defaultAssigneeId: assignee[0] ?? null }),
              }),
              t("saved"),
            )
          }
        >
          {t("save")}
        </Button>
      </SettingsSection>

      <SettingsSection
        title={t("ignoreTitle")}
        description={mailbox.personal ? t("personal.ignoreDescription") : t("ignoreDescription")}
      >
        <IgnoreRules ws={ws} mailboxId={mailbox.id} rules={mailbox.ignoreRules} />
      </SettingsSection>

      <SettingsSection title={t("logTitle")} description={t("logDescription")}>
        {mailbox.logs.length === 0 ? (
          <p className="text-small text-fg-muted">{t("logEmpty")}</p>
        ) : (
          <table className="w-full text-small" data-testid="sync-log">
            <thead>
              <tr className="border-b border-border text-left text-caption text-fg-muted">
                <th className="py-1.5 pr-3 font-medium">{t("logWhen")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("logKind")}</th>
                <th className="py-1.5 font-medium">{t("logResult")}</th>
              </tr>
            </thead>
            <tbody>
              {mailbox.logs.map((l) => (
                <tr key={l.id} className="border-b border-border align-top last:border-0">
                  <td
                    className="py-1.5 pr-3 whitespace-nowrap text-fg-secondary tabular"
                    suppressHydrationWarning
                  >
                    {relative(l.startedAt)}
                  </td>
                  <td className="py-1.5 pr-3 text-fg">{t(`kind.${l.kind}` as never)}</td>
                  <td className={cn("py-1.5", l.error ? "text-danger-text" : "text-fg-secondary")}>
                    {l.error ? l.error : !l.finishedAt ? t("logRunning") : statLine(l.stats)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SettingsSection>

      <SettingsSection
        title={t("disconnectTitle")}
        description={
          mailbox.personal ? t("personal.disconnectDescription") : t("disconnectDescription")
        }
      >
        <Button
          variant="danger"
          className="self-start"
          loading={busy === "disconnect"}
          onClick={() => {
            const confirm = mailbox.personal
              ? t("personal.disconnectConfirm")
              : t("disconnectConfirm");
            if (!window.confirm(confirm)) return;
            void (async () => {
              const ok = await run(setMailboxStateAction(ws, mailbox.id, "disconnect"), onError);
              if (!ok) return;
              if (mailbox.personal) router.refresh();
              else router.push(`/${ws}/settings/mailboxes` as never);
            })();
          }}
          data-testid="mailbox-disconnect"
        >
          <Unplug />
          {t("disconnect")}
        </Button>
      </SettingsSection>
    </div>
  );
}

/* ───────────────────────── your own mailbox (D-138) ───────────────────────── */

/**
 * Settings → My mailbox: connect the work mailbox of the address you sign in
 * with, or its status page once it's connected.
 */
export function PersonalMailbox({
  ws,
  email,
  mailbox,
}: {
  ws: string;
  /** The address on your account: the only one you can connect. */
  email: string;
  mailbox: MailboxAdmin | null;
}) {
  const t = useTranslations("mailboxes.personal");
  const router = useRouter();
  const onError = useErrors();
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  if (mailbox) return <MailboxStatus ws={ws} mailbox={mailbox} people={[]} />;
  const connect = async () => {
    setBusy(true);
    const r = await run(
      connectPersonalMailboxAction(ws, { backfillDays: Number(days) || 30 }),
      onError,
    );
    setBusy(false);
    if (r) router.refresh();
  };
  return (
    <div data-testid="personal-mailbox">
      <SettingsSection title={t("title")} description={t("description")}>
        <div className="flex flex-col gap-4 rounded-card border border-border p-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-icon" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-body font-medium text-fg">{t("connectTitle", { email })}</span>
              <span className="text-small text-fg-muted">{t("connectDescription")}</span>
            </div>
          </div>
          <ul className="list-disc pl-5 text-small text-fg-secondary">
            <li>{t("privacy.onlyYou")}</li>
            <li>{t("privacy.shared")}</li>
            <li>{t("privacy.items")}</li>
          </ul>
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-fg-secondary">{t("backfill")}</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-32"
            />
            <span className="text-small text-fg-muted">{t("backfillHint")}</span>
          </label>
          <Button
            variant="primary"
            className="self-start"
            loading={busy}
            onClick={() => void connect()}
            data-testid="connect-personal-mailbox"
          >
            <Plug />
            {t("connect")}
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
