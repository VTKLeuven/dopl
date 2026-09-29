"use client";

import { Fragment, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown, Download, ScrollText } from "lucide-react";
import type { AuditRow } from "@/server/queries/agent";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SettingsSection } from "@/components/settings/section";
import { selectClass } from "./settings/agent-settings";

interface Page {
  rows: AuditRow[];
  nextCursor: string | null;
}

interface Filter {
  action: string;
  actorId: string;
  from: string;
  to: string;
}

const qs = (f: Filter, extra: Record<string, string> = {}) =>
  new URLSearchParams(
    Object.entries({ ...f, ...extra }).filter(([, v]) => v) as Array<[string, string]>,
  ).toString();

/**
 * Settings → Audit log (Phase 8): sign-ins, roles, settings, mailboxes and
 * everything the AI teammate did or was allowed to do. Append-only; export
 * as CSV or JSON (the export is logged too).
 */
export function AuditLogView({
  ws,
  initial,
  facets,
}: {
  ws: string;
  initial: Page;
  facets: { actions: string[]; actors: Array<{ id: string; label: string }> };
}) {
  const t = useTranslations("audit");
  const format = useFormatter();
  const [filter, setFilter] = useState<Filter>({ action: "", actorId: "", from: "", to: "" });
  const [open, setOpen] = useState<string | null>(null);
  const empty = !filter.action && !filter.actorId && !filter.from && !filter.to;
  const query = useInfiniteQuery({
    queryKey: ["audit", ws, filter],
    queryFn: async ({ pageParam }) => {
      const res = await fetch(`/api/v1/${ws}/audit?${qs(filter, pageParam ? { cursor: pageParam } : {})}`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: empty ? { pages: [initial], pageParams: [null] } : undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const set = (k: keyof Filter, v: string) => setFilter((f) => ({ ...f, [k]: v }));

  return (
    <SettingsSection title={t("title")} description={t("hint")} className="md:grid-cols-1">
      <div className="flex flex-wrap items-end gap-2">
        <select
          aria-label={t("filter.action")}
          value={filter.action}
          onChange={(e) => set("action", e.target.value)}
          className={selectClass}
          data-testid="audit-action"
        >
          <option value="">{t("filter.allActions")}</option>
          {facets.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          aria-label={t("filter.actor")}
          value={filter.actorId}
          onChange={(e) => set("actorId", e.target.value)}
          className={cn(selectClass, "max-w-56")}
        >
          <option value="">{t("filter.allActors")}</option>
          {facets.actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <Input
          type="date"
          aria-label={t("filter.from")}
          value={filter.from}
          onChange={(e) => set("from", e.target.value)}
          className="w-40"
        />
        <Input
          type="date"
          aria-label={t("filter.to")}
          value={filter.to}
          onChange={(e) => set("to", e.target.value)}
          className="w-40"
        />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" asChild>
            <a href={`/api/v1/${ws}/audit/export?${qs(filter, { format: "csv" })}`} data-testid="audit-export-csv">
              <Download />
              {t("exportCsv")}
            </a>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <a href={`/api/v1/${ws}/audit/export?${qs(filter, { format: "json" })}`}>
              <Download />
              {t("exportJson")}
            </a>
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <p className="text-small text-fg-muted">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <EmptyState compact icon={<ScrollText />} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-small" data-testid="audit-table">
            <thead className="bg-surface-muted text-left text-caption text-fg-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("col.when")}</th>
                <th className="px-3 py-2 font-medium">{t("col.actor")}</th>
                <th className="px-3 py-2 font-medium">{t("col.action")}</th>
                <th className="px-3 py-2 font-medium">{t("col.target")}</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    className="cursor-pointer border-t border-border hover:bg-surface-hover"
                    onClick={() => setOpen((o) => (o === r.id ? null : r.id))}
                    data-testid="audit-row"
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-fg-muted tabular">
                      {format.dateTime(new Date(r.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })}
                    </td>
                    <td className="max-w-56 truncate px-3 py-2">
                      {r.actorLabel ?? t(`actorType.${r.actorType}` as "actorType.SYSTEM")}
                    </td>
                    <td className="px-3 py-2 font-mono text-caption text-fg">{r.action}</td>
                    <td className="max-w-48 truncate px-3 py-2 text-fg-muted">
                      {r.targetType ? `${r.targetType}` : ""}
                    </td>
                    <td className="px-2 py-2">
                      <ChevronDown
                        className={cn("size-3.5 text-icon transition-transform", open === r.id && "rotate-180")}
                        aria-hidden
                      />
                    </td>
                  </tr>
                  {open === r.id ? (
                    <tr className="border-t border-border bg-surface-muted">
                      <td colSpan={5} className="px-3 py-2">
                        <pre className="overflow-x-auto font-mono text-caption whitespace-pre-wrap text-fg-secondary">
                          {JSON.stringify(
                            { target: r.targetId, ip: r.ip, ...(r.metadata as object) },
                            null,
                            2,
                          )}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          className="self-start"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("loadMore")}
        </Button>
      ) : null}
    </SettingsSection>
  );
}
