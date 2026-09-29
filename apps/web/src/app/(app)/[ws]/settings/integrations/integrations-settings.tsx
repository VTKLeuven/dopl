"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, Ellipsis, Plus, RotateCcw, Send, Trash, Webhook } from "lucide-react";
import {
  AVAILABLE_WEBHOOK_EVENTS,
  isAllowedWebhookUrl,
  type WebhookEvent,
} from "@dopl/shared/schemas/webhooks";
import type { WebhookView } from "@/server/queries/webhooks";
import {
  createWebhookAction,
  deleteWebhookAction,
  redeliverAction,
  sendTestMessageAction,
  updateWebhookAction,
} from "@/server/actions/webhooks";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
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
import { ProjectBadge } from "@/components/shell/project-badge";

/** Message keys can't contain dots: "work_item.created" → "work_item_created". */
const eventKey = (e: string) => e.replace(/\./g, "_") as "work_item_created";

interface Project {
  id: string;
  name: string;
  color: string | null;
}

/** Settings → Integrations (D-052): Discord webhooks, test messages, delivery log. */
export function IntegrationsSettings({
  ws,
  hooks,
  projects,
  mailboxes,
  allowLocal,
}: {
  ws: string;
  hooks: WebhookView[];
  projects: Project[];
  /** Connected shared mailboxes, for the mail events' filter (Phase 7). */
  mailboxes: Array<{ id: string; name: string }>;
  allowLocal: boolean;
}) {
  const t = useTranslations("integrations");
  const [editing, setEditing] = useState<WebhookView | "new" | null>(null);
  return (
    <>
      <SettingsSection title={t("discord")} description={t("discordHint")}>
        {hooks.length === 0 ? (
          <EmptyState
            compact
            icon={<Webhook />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              <Button variant="primary" onClick={() => setEditing("new")} data-testid="add-webhook">
                <Plus />
                {t("add")}
              </Button>
            }
          />
        ) : (
          <>
            {hooks.map((h) => (
              <HookCard
                key={h.id}
                ws={ws}
                hook={h}
                projects={projects}
                onEdit={() => setEditing(h)}
              />
            ))}
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => setEditing("new")}
              data-testid="add-webhook"
            >
              <Plus />
              {t("add")}
            </Button>
          </>
        )}
      </SettingsSection>
      <SettingsSection title={t("safety")} description={t("safetyHint")}>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-secondary">
          <li>{t("safety1")}</li>
          <li>{t("safety2")}</li>
          <li>{t("safety3")}</li>
        </ul>
      </SettingsSection>
      {editing ? (
        <HookDialog
          key={editing === "new" ? "new" : editing.id}
          ws={ws}
          hook={editing === "new" ? null : editing}
          projects={projects}
          mailboxes={mailboxes}
          allowLocal={allowLocal}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function HookCard({
  ws,
  hook: h,
  projects,
  onEdit,
}: {
  ws: string;
  hook: WebhookView;
  projects: Project[];
  onEdit: () => void;
}) {
  const t = useTranslations("integrations");
  const relative = useRelativeTime();
  const router = useRouter();
  const [log, setLog] = useState(false);
  const scope =
    h.projectIds.length === 0
      ? t("allProjects")
      : projects
          .filter((p) => h.projectIds.includes(p.id))
          .map((p) => p.name)
          .join(", ");
  const run = async (fn: () => Promise<{ ok: boolean }>, done?: string) => {
    const res = await fn();
    if (res.ok) {
      if (done) toast(done);
      router.refresh();
    } else toast.error(t("errors.generic"));
  };
  return (
    <div className="rounded-card border border-border bg-surface" data-testid="webhook-card">
      <div className="flex items-start gap-3 p-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control border border-border bg-surface-muted">
          <Webhook className="size-4 text-icon" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{h.name}</span>
            <span className="truncate font-mono text-caption text-fg-muted">{h.urlHint}</span>
          </div>
          <p className="text-small text-fg-muted">
            {h.events.map((e) => t(`event.${eventKey(e)}`)).join(" · ")}
          </p>
          <p className="text-small text-fg-muted">
            {scope}
            {h.includeContent ? ` · ${t("withContent")}` : ""}
            {h.lastDeliveryAt
              ? ` · ${t("lastDelivery", { when: relative(h.lastDeliveryAt) })}`
              : ""}
          </p>
        </div>
        <Switch
          checked={h.enabled}
          aria-label={t("enabled")}
          onCheckedChange={(enabled) =>
            void run(() => updateWebhookAction(ws, { id: h.id, enabled }))
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("actions")}>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!h.enabled}
              onSelect={() => void run(() => sendTestMessageAction(ws, h.id), t("testSent"))}
            >
              <Send />
              {t("sendTest")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>{t("edit")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => void run(() => deleteWebhookAction(ws, h.id), t("deleted"))}
            >
              <Trash />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {h.disabledReason && !h.enabled ? (
        <div className="px-4 pb-3">
          <Banner tone="danger" title={h.disabledReason}>
            {h.lastError ? <span className="font-mono text-caption">{h.lastError}</span> : null}
          </Banner>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setLog((l) => !l)}
        aria-expanded={log}
        className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2 text-left text-small text-fg-secondary focus-ring hover:bg-surface-hover"
      >
        <ChevronDown
          className={cn("size-3.5 transition-transform", log && "rotate-180")}
          aria-hidden
        />
        {t("deliveryLog", { count: h.deliveries.length })}
      </button>
      {log ? (
        h.deliveries.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-small text-fg-muted">
            {t("noDeliveries")}
          </p>
        ) : (
          <table className="w-full border-t border-border text-small">
            <thead className="text-left text-caption text-fg-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t("col.event")}</th>
                <th className="px-2 py-2 font-medium">{t("col.status")}</th>
                <th className="px-2 py-2 font-medium">{t("col.response")}</th>
                <th className="px-2 py-2 font-medium">{t("col.when")}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {h.deliveries.map((d) => (
                <tr key={d.id} className="border-t border-border" data-testid="delivery-row">
                  <td className="px-4 py-2">{t(`event.${eventKey(d.eventType)}`)}</td>
                  <td className="px-2 py-2">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-[6px] border px-1.5 text-caption font-medium",
                        d.status === "SENT" &&
                          "border-success-border bg-success-bg text-success-text",
                        d.status === "FAILED" &&
                          "border-danger-border bg-danger-bg text-danger-text",
                        (d.status === "PENDING" || d.status === "DROPPED") &&
                          "border-border-strong bg-neutral-100 text-fg-muted",
                      )}
                      title={d.error ?? undefined}
                    >
                      {t(`status.${d.status}`)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-fg-muted tabular">{d.responseStatus ?? "—"}</td>
                  <td className="px-2 py-2 text-fg-muted tabular">
                    {relative(d.sentAt ?? d.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={!h.enabled || d.status === "PENDING"}
                      onClick={() => void run(() => redeliverAction(ws, d.id), t("redelivered"))}
                    >
                      <RotateCcw />
                      {t("redeliver")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </div>
  );
}

function HookDialog({
  ws,
  hook,
  projects,
  mailboxes,
  allowLocal,
  onClose,
}: {
  ws: string;
  hook: WebhookView | null;
  projects: Project[];
  mailboxes: Array<{ id: string; name: string }>;
  allowLocal: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("integrations");
  const router = useRouter();
  const [name, setName] = useState(hook?.name ?? "");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(
    (hook?.events as WebhookEvent[] | undefined) ?? ["work_item.created", "intake.submitted"],
  );
  const [projectIds, setProjectIds] = useState<string[]>(hook?.projectIds ?? []);
  const [mailboxIds, setMailboxIds] = useState<string[]>(hook?.mailboxIds ?? []);
  const mailEvents = events.some((e) => e.startsWith("email_"));
  const [includeContent, setIncludeContent] = useState(hook?.includeContent ?? false);
  const [pending, setPending] = useState(false);
  const urlInvalid = url !== "" && !isAllowedWebhookUrl(url.trim(), { allowLocal });
  const valid = name.trim() && events.length > 0 && (hook ? !urlInvalid : url && !urlInvalid);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setPending(true);
    const base = { name: name.trim(), events, projectIds, mailboxIds, includeContent };
    const res = hook
      ? await updateWebhookAction(ws, { id: hook.id, ...base, ...(url ? { url: url.trim() } : {}) })
      : await createWebhookAction(ws, { ...base, url: url.trim() });
    setPending(false);
    if (!res.ok) {
      toast.error(res.message === "invalid_webhook_url" ? t("errors.url") : t("errors.generic"));
      return;
    }
    toast(hook ? t("saved") : t("created"));
    onClose();
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent size="md" closeLabel={t("cancel")}>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{hook ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("addHint")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hook-name">{t("name")}</Label>
              <Input
                id="hook-name"
                value={name}
                placeholder="#it-tickets"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hook-url">{t("url")}</Label>
              <Input
                id="hook-url"
                type="url"
                value={url}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={urlInvalid || undefined}
                placeholder={
                  hook ? t("urlKeep", { hint: hook.urlHint }) : "https://discord.com/api/webhooks/…"
                }
                onChange={(e) => setUrl(e.target.value)}
              />
              {urlInvalid ? (
                <FieldError>{t("errors.url")}</FieldError>
              ) : (
                <FieldHint>{t("urlHint")}</FieldHint>
              )}
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-body font-medium">{t("events")}</legend>
              {AVAILABLE_WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-body">
                  <Checkbox
                    checked={events.includes(ev)}
                    onCheckedChange={(c) =>
                      setEvents((all) => (c ? [...all, ev] : all.filter((x) => x !== ev)))
                    }
                  />
                  {t(`event.${eventKey(ev)}`)}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-body font-medium">{t("projects")}</legend>
              <label className="flex items-center gap-2 text-body">
                <Checkbox
                  checked={projectIds.length === 0}
                  onCheckedChange={(c) => c && setProjectIds([])}
                />
                {t("allProjects")}
              </label>
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-body">
                  <Checkbox
                    checked={projectIds.includes(p.id)}
                    onCheckedChange={(c) =>
                      setProjectIds((all) => (c ? [...all, p.id] : all.filter((x) => x !== p.id)))
                    }
                  />
                  <ProjectBadge name={p.name} color={p.color} size={16} />
                  {p.name}
                </label>
              ))}
            </fieldset>
            {mailEvents && mailboxes.length > 0 ? (
              <fieldset className="flex flex-col gap-2" data-testid="hook-mailboxes">
                <legend className="mb-1 text-body font-medium">{t("mailboxes")}</legend>
                <label className="flex items-center gap-2 text-body">
                  <Checkbox
                    checked={mailboxIds.length === 0}
                    onCheckedChange={(c) => c && setMailboxIds([])}
                  />
                  {t("allMailboxes")}
                </label>
                {mailboxes.map((mb) => (
                  <label key={mb.id} className="flex items-center gap-2 text-body">
                    <Checkbox
                      checked={mailboxIds.includes(mb.id)}
                      onCheckedChange={(c) =>
                        setMailboxIds((all) =>
                          c ? [...all, mb.id] : all.filter((x) => x !== mb.id),
                        )
                      }
                    />
                    {mb.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="flex items-start justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-body font-medium">{t("includeContent")}</span>
                <FieldHint>{t("includeContentHint")}</FieldHint>
              </span>
              <Switch checked={includeContent} onCheckedChange={setIncludeContent} />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!valid}>
              {hook ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
