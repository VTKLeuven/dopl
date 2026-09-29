"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, Inbox, Plus } from "lucide-react";
import type { FormListItem } from "@/server/queries/intake";
import { createFormAction } from "@/server/actions/intake";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import { cn } from "@/lib/cn";

export function FormsList({
  ws,
  project,
  forms,
  intakeEnabled,
}: {
  ws: string;
  project: { id: string; identifier: string; name: string; color: string | null };
  forms: FormListItem[];
  intakeEnabled: boolean;
}) {
  const t = useTranslations("forms");
  const relative = useRelativeTime();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const base = `/${ws}/p/${project.identifier}/intake`;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    const res = await createFormAction(ws, { projectId: project.id, title: title.trim() });
    setPending(false);
    if (!res.ok) {
      toast.error(t("errors.generic"));
      return;
    }
    router.push(`${base}/forms/${res.data.id}` as never);
  };

  return (
    <>
      <PageHeader
        crumbs={[
          {
            label: project.name,
            icon: <ProjectBadge name={project.name} color={project.color} size={18} />,
            href: `/${ws}/p/${project.identifier}/items`,
          },
          { label: t("intake"), icon: <Inbox />, href: base },
          { label: t("title") },
        ]}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-form">
            <Plus />
            {t("newForm")}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!intakeEnabled ? (
          <div className="px-5 pt-4">
            <Banner
              tone="warning"
              title={t("intakeOff")}
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/${ws}/p/${project.identifier}/settings` as never}>
                    {t("openSettings")}
                  </Link>
                </Button>
              }
            />
          </div>
        ) : null}
        {forms.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus />
                {t("newForm")}
              </Button>
            }
          />
        ) : (
          <ul>
            {forms.map((f) => (
              <li key={f.id}>
                <Link
                  href={`${base}/forms/${f.id}` as never}
                  className="flex h-[var(--row-height)] items-center gap-3 border-b border-border px-5 focus-ring transition-colors hover:bg-surface-hover"
                  data-testid="form-row"
                >
                  <FileText className="size-4 shrink-0 text-icon" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{f.title}</span>
                  <span className="hidden truncate text-small text-fg-muted md:inline">
                    /f/{f.slug}
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-6 items-center rounded-[7px] border px-2 text-small font-medium",
                      f.isPublished
                        ? "border-success-border bg-success-bg text-success-text"
                        : "border-border-strong bg-neutral-100 text-fg-muted",
                    )}
                  >
                    {f.isPublished ? t("published") : t("draft")}
                  </span>
                  <span className="w-28 text-right text-small text-fg-muted tabular">
                    {t("submissions", { count: f.submissions })}
                  </span>
                  <span className="w-24 text-right text-small whitespace-nowrap text-fg-muted tabular">
                    {relative(f.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent size="sm" closeLabel={t("cancel")}>
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>{t("newForm")}</DialogTitle>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-1.5">
              <Label htmlFor="form-title">{t("formTitle")}</Label>
              <Input
                id="form-title"
                autoFocus
                value={title}
                placeholder={t("formTitlePlaceholder")}
                onChange={(e) => setTitle(e.target.value)}
              />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" variant="primary" loading={pending} disabled={!title.trim()}>
                {t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
