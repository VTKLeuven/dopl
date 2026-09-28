"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryState, parseAsBoolean } from "nuqs";
import { useTranslations } from "next-intl";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Lock, Plus, FolderKanban, Users, CircleDot, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import { CreateProjectDialog } from "./create-project-dialog";

interface Row {
  id: string;
  identifier: string;
  name: string;
  color: string | null;
  private: boolean;
  archived: boolean;
  updatedAt: string;
  lead: { id: string; name: string; image: string | null } | null;
  members: number;
  open: number;
}

export function ProjectsView({ ws, title, icon, canCreate, projects }: { ws: string; title: string; icon: React.ReactNode; canCreate: boolean; projects: Row[] }) {
  const t = useTranslations("projects");
  const relative = useRelativeTime();
  const router = useRouter();
  const [creating, setCreating] = useQueryState("new", parseAsBoolean.withDefault(false));

  return (
    <>
      <PageHeader
        crumbs={[{ label: title, icon }]}
        actions={
          canCreate ? (
            <Tooltip content={t("new")}>
              <Button variant="primary" onClick={() => void setCreating(true)}>
                <Plus />
                {t("new")}
              </Button>
            </Tooltip>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={canCreate ? <Button variant="primary" onClick={() => void setCreating(true)}><Plus />{t("new")}</Button> : null}
          />
        ) : (
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="h-10 border-b border-border text-left">
                {[
                  { k: "colName", icon: <FolderKanban />, cls: "pl-5" },
                  { k: "colLead", icon: <UserRound />, cls: "hidden md:table-cell" },
                  { k: "colOpen", icon: <CircleDot />, cls: "hidden sm:table-cell" },
                  { k: "colMembers", icon: <Users />, cls: "hidden md:table-cell" },
                  { k: "colUpdated", icon: null, cls: "hidden lg:table-cell pr-5" },
                ].map((c) => (
                  <th key={c.k} className={`font-medium text-fg ${c.cls}`}>
                    <span className="inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:text-icon">{c.icon}{t(c.k as "colName")}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/${ws}/p/${p.identifier}/items` as never)}
                  className="h-[var(--row-height)] cursor-default border-b border-border transition-colors hover:bg-surface-hover"
                >
                  <td className="pl-5">
                    <Link href={`/${ws}/p/${p.identifier}/items` as never} className="inline-flex items-center gap-2.5 focus-ring rounded-[6px]" onClick={(e) => e.stopPropagation()}>
                      <ProjectBadge name={p.name} color={p.color} size={22} />
                      <span className="font-medium text-fg">{p.name}</span>
                      <span className="tabular text-small text-fg-muted">{p.identifier}</span>
                      {p.private ? <Tooltip content={t("private")}><Lock className="size-3.5 text-icon" /></Tooltip> : null}
                      {p.archived ? <span className="rounded-[6px] bg-neutral-150 px-1.5 text-caption font-medium text-fg-muted">{t("archived")}</span> : null}
                    </Link>
                  </td>
                  <td className="hidden md:table-cell">
                    {p.lead ? (
                      <span className="inline-flex items-center gap-2 text-fg-secondary">
                        <Avatar user={p.lead} size="sm" />
                        {p.lead.name}
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular hidden text-fg-secondary sm:table-cell">{p.open}</td>
                  <td className="tabular hidden text-fg-secondary md:table-cell">{p.members}</td>
                  <td className="tabular hidden pr-5 text-fg-muted lg:table-cell">{relative(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canCreate ? <CreateProjectDialog ws={ws} open={creating} onOpenChange={(o) => void setCreating(o ? true : null)} /> : null}
    </>
  );
}
