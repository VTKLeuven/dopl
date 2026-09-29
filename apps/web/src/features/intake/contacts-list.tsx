"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Ban, Search, Users } from "lucide-react";
import type { ContactRow } from "@/server/queries/contacts";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shell/page-header";

/** People outside the team who wrote in (ROADMAP Phase 3.8). */
export function ContactsList({ ws, contacts }: { ws: string; contacts: ContactRow[] }) {
  const t = useTranslations("contacts");
  const relative = useRelativeTime();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((c) =>
      [c.name, c.email, c.organization].some((v) => v?.toLowerCase().includes(term)),
    );
  }, [contacts, q]);
  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), icon: <Users /> }]} />
      <div className="flex h-[var(--toolbar-height)] shrink-0 items-center gap-2 border-b border-border px-5">
        <div className="relative w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-icon"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-8 pl-8"
          />
        </div>
        <span className="ml-auto text-small text-fg-muted tabular">
          {t("count", { count: shown.length })}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={q ? t("noMatches") : t("emptyTitle")}
            description={q ? undefined : t("emptyBody")}
          />
        ) : (
          <ul>
            {shown.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/${ws}/contacts/${c.id}` as never}
                  className="flex h-[var(--row-height)] items-center gap-3 border-b border-border px-5 focus-ring transition-colors hover:bg-surface-hover"
                  data-testid="contact-row"
                >
                  <Avatar user={{ id: c.email, name: c.name ?? c.email }} size="md" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-fg">{c.name ?? c.email}</span>
                    {c.name ? (
                      <span className="truncate text-small text-fg-muted">{c.email}</span>
                    ) : null}
                  </span>
                  {c.blocked ? (
                    <span className="inline-flex h-6 items-center gap-1 rounded-[7px] border border-danger-border bg-danger-bg px-2 text-small font-medium text-danger-text">
                      <Ban className="size-3" aria-hidden />
                      {t("blocked")}
                    </span>
                  ) : null}
                  <span className="hidden w-48 truncate text-small text-fg-secondary md:inline">
                    {c.organization ?? ""}
                  </span>
                  <span className="w-24 text-right text-small text-fg-muted tabular">
                    {t("requests", { count: c.requests })}
                  </span>
                  <span className="w-24 text-right text-small whitespace-nowrap text-fg-muted tabular">
                    {c.lastSeenAt ? relative(c.lastSeenAt) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
