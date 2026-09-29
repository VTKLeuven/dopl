"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, Combine, Mail, Users } from "lucide-react";
import type { ContactDetail, ContactRow } from "@/server/queries/contacts";
import {
  mergeContactsAction,
  setContactBlockedAction,
  updateContactAction,
} from "@/server/actions/contacts";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Textarea } from "@/components/ui/input";
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
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import { StatusBadge } from "./request-thread";

export function ContactDetailView({
  ws,
  contact: c,
  others,
  canMerge,
}: {
  ws: string;
  contact: ContactDetail;
  others: ContactRow[];
  canMerge: boolean;
}) {
  const t = useTranslations("contacts");
  const format = useFormatter();
  const router = useRouter();
  const [form, setForm] = useState({
    name: c.name ?? "",
    organization: c.organization ?? "",
    phone: c.phone ?? "",
    notes: c.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [merging, setMerging] = useState(false);
  const [target, setTarget] = useState<ContactRow | null>(null);
  const dirty =
    form.name !== (c.name ?? "") ||
    form.organization !== (c.organization ?? "") ||
    form.phone !== (c.phone ?? "") ||
    form.notes !== (c.notes ?? "");

  const save = async () => {
    setSaving(true);
    const res = await updateContactAction(ws, {
      id: c.id,
      name: form.name || null,
      organization: form.organization || null,
      phone: form.phone || null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (res.ok) {
      toast(t("saved"));
      router.refresh();
    } else toast.error(t("errors.generic"));
  };

  return (
    <>
      <PageHeader
        crumbs={[
          { label: t("title"), icon: <Users />, href: `/${ws}/contacts` },
          { label: c.name ?? c.email },
        ]}
        actions={
          <>
            {canMerge ? (
              <Button variant="secondary" onClick={() => setMerging(true)}>
                <Combine />
                {t("merge")}
              </Button>
            ) : null}
            <Button
              variant={c.blocked ? "secondary" : "danger-ghost"}
              onClick={async () => {
                const res = await setContactBlockedAction(ws, c.id, !c.blocked);
                if (res.ok) {
                  toast(c.blocked ? t("unblockedToast") : t("blockedToast"));
                  router.refresh();
                } else toast.error(t("errors.generic"));
              }}
              data-testid="contact-block"
            >
              <Ban />
              {c.blocked ? t("unblock") : t("block")}
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1080px] gap-8 px-6 py-8 lg:grid-cols-[320px_1fr]">
          <section className="flex flex-col gap-4" aria-label={t("details")}>
            <div className="flex items-center gap-3">
              <Avatar user={{ id: c.email, name: c.name ?? c.email }} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-title font-semibold">{c.name ?? c.email}</p>
                <a
                  href={`mailto:${c.email}`}
                  className="truncate text-small text-link hover:underline"
                >
                  {c.email}
                </a>
              </div>
            </div>
            {c.blocked ? <Banner tone="danger" title={t("blockedBanner")} /> : null}
            <p className="text-small text-fg-muted">
              {t("since", {
                date: format.dateTime(new Date(c.createdAt), { dateStyle: "medium" }),
              })}
            </p>
            {(["name", "organization", "phone"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-1.5">
                <Label htmlFor={`contact-${k}`}>{t(`field.${k}`)}</Label>
                <Input
                  id={`contact-${k}`}
                  value={form[k]}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-notes">{t("field.notes")}</Label>
              <Textarea
                id="contact-notes"
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <Button
              variant="primary"
              className="self-start"
              disabled={!dirty}
              loading={saving}
              onClick={() => void save()}
            >
              {t("save")}
            </Button>
          </section>
          {c.threads.length ? (
            <section className="flex flex-col gap-3" aria-label={t("threadsTitle")}>
              <h2 className="text-body font-semibold">{t("threadsTitle")}</h2>
              <ul
                className="overflow-hidden rounded-card border border-border"
                data-testid="contact-threads"
              >
                {c.threads.map((th) => (
                  <li key={th.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={`/${ws}/mail?view=all&thread=${th.id}` as never}
                      className="flex h-12 items-center gap-3 px-4 focus-ring transition-colors hover:bg-surface-hover"
                    >
                      <Mail className="size-4 shrink-0 text-icon" />
                      <span className="min-w-0 flex-1 truncate text-body">{th.subject}</span>
                      <span className="shrink-0 text-small text-fg-muted">
                        {t(`threadStatus.${th.status}`)} ·{" "}
                        {t("messages", { count: th.messageCount })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="flex flex-col gap-3" aria-label={t("requestsTitle")}>
            <h2 className="text-body font-semibold">{t("requestsTitle")}</h2>
            {c.requests.length === 0 ? (
              <EmptyState compact title={t("noRequests")} />
            ) : (
              <ul className="overflow-hidden rounded-card border border-border">
                {c.requests.map((r) => (
                  <li key={r.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={
                        (r.identifier
                          ? `/${ws}/i/${r.identifier}`
                          : `/${ws}/p/${r.project.identifier}/intake?tab=${r.status === "declined" ? "declined" : r.status === "duplicate" ? "duplicate" : "pending"}&peek=${r.id}`) as never
                      }
                      className="flex h-12 items-center gap-3 px-4 focus-ring transition-colors hover:bg-surface-hover"
                    >
                      <ProjectBadge name={r.project.name} color={r.project.color} size={16} />
                      <span className="w-20 shrink-0 text-small text-fg-muted tabular">
                        {r.identifier ?? `#${r.number}`}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body">{r.title}</span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <Dialog open={merging} onOpenChange={setMerging}>
        <DialogContent size="md" closeLabel={t("cancel")}>
          <DialogHeader>
            <DialogTitle>{t("mergeTitle", { name: c.name ?? c.email })}</DialogTitle>
            <DialogDescription>{t("mergeHint")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Command className="rounded-control border border-border">
              <CommandInput placeholder={t("search")} />
              <CommandList className="max-h-64">
                <CommandEmpty>{t("noMatches")}</CommandEmpty>
                {others
                  .filter((o) => o.id !== c.id)
                  .map((o) => (
                    <CommandItem
                      key={o.id}
                      value={`${o.name ?? ""} ${o.email}`}
                      onSelect={() => setTarget(o)}
                      data-selected={target?.id === o.id || undefined}
                    >
                      <Avatar user={{ id: o.email, name: o.name ?? o.email }} size="xs" />
                      <span className="truncate">{o.name ?? o.email}</span>
                      {o.name ? <span className="truncate text-fg-muted">{o.email}</span> : null}
                    </CommandItem>
                  ))}
              </CommandList>
            </Command>
            {target ? (
              <p className="mt-3 text-body">
                {t("mergeInto", { from: c.email, into: target.email })}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMerging(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={!target}
              onClick={async () => {
                if (!target) return;
                const res = await mergeContactsAction(ws, { sourceId: c.id, targetId: target.id });
                if (res.ok) router.push(`/${ws}/contacts/${target.id}` as never);
                else toast.error(t("errors.generic"));
              }}
            >
              {t("merge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
