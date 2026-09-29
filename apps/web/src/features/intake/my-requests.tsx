"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MessageSquare, Plus, Send } from "lucide-react";
import { textToDoc } from "@dopl/shared/rich-text";
import type { MyRequestRow } from "@/server/queries/intake";
import { submitRequestAction } from "@/server/actions/intake";
import { useRelativeTime } from "@/lib/use-relative-time";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError, Input, Label, Textarea, inputClasses } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import { StatusBadge } from "./request-thread";

interface RequestProject {
  id: string;
  identifier: string;
  name: string;
  color: string | null;
}

/** A guest's requests across projects, plus "New request" (ROADMAP Phase 3.2). */
export function MyRequests({
  ws,
  rows,
  projects,
}: {
  ws: string;
  rows: MyRequestRow[];
  projects: RequestProject[];
}) {
  const t = useTranslations("requests");
  const relative = useRelativeTime();
  const [open, setOpen] = useState(false);
  const newButton =
    projects.length > 0 ? (
      <Button variant="primary" onClick={() => setOpen(true)} data-testid="new-request">
        <Plus />
        {t("new")}
      </Button>
    ) : null;
  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), icon: <Send /> }]} actions={newButton} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Send />}
            title={t("emptyTitle")}
            description={projects.length ? t("emptyBody") : t("noProjects")}
            action={newButton}
          />
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/${ws}/requests/${r.id}` as never}
                  className="flex h-[var(--row-height)] items-center gap-3 border-b border-border px-5 focus-ring transition-colors hover:bg-surface-hover"
                  data-testid="my-request"
                >
                  <ProjectBadge name={r.project.name} color={r.project.color} size={18} />
                  <span className="w-10 shrink-0 text-small text-fg-muted tabular">
                    #{r.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{r.title}</span>
                  {r.publicCommentCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-small text-fg-muted tabular">
                      <MessageSquare className="size-3.5" aria-hidden />
                      {r.publicCommentCount}
                    </span>
                  ) : null}
                  <StatusBadge status={r.status} />
                  <span className="w-24 shrink-0 text-right text-small whitespace-nowrap text-fg-muted tabular">
                    {relative(r.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <NewRequestDialog ws={ws} open={open} onOpenChange={setOpen} projects={projects} />
    </>
  );
}

function NewRequestDialog({
  ws,
  open,
  onOpenChange,
  projects,
}: {
  ws: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: RequestProject[];
}) {
  const t = useTranslations("requests");
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t("titleRequired"));
      return;
    }
    setPending(true);
    const res = await submitRequestAction(ws, {
      projectId,
      title: title.trim(),
      description: details.trim() ? textToDoc(details) : null,
    });
    setPending(false);
    if (!res.ok) {
      toast.error(t("submitFailed"));
      return;
    }
    onOpenChange(false);
    setTitle("");
    setDetails("");
    router.push(`/${ws}/requests/${res.data.id}` as never);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" closeLabel={t("cancel")}>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{t("new")}</DialogTitle>
            <DialogDescription>{t("newHint")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {projects.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="req-project">{t("project")}</Label>
                <select
                  id="req-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={cn(inputClasses, "appearance-auto")}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="req-title">{t("requestTitle")}</Label>
              <Input
                id="req-title"
                autoFocus
                value={title}
                aria-invalid={error ? true : undefined}
                placeholder={t("titlePlaceholder")}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError(null);
                }}
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="req-details">{t("details")}</Label>
              <Textarea
                id="req-details"
                rows={6}
                value={details}
                placeholder={t("detailsPlaceholder")}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
