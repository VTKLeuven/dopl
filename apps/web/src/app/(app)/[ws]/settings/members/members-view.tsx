"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, Ellipsis, Mail, UserPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import {
  changeRoleAction,
  inviteMembersAction,
  resendInviteAction,
  revokeInviteAction,
  setMemberActiveAction,
} from "@/server/actions/members";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label, FieldError, FieldHint, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogBody,
  DialogClose,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectBadge } from "@/components/shell/project-badge";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
const ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER", "GUEST"];

interface Props {
  ws: string;
  workspaceName: string;
  currentUserId: string;
  isOwner: boolean;
  members: Array<{
    id: string;
    role: Role;
    status: "ACTIVE" | "INVITED" | "DEACTIVATED";
    joinedAt: string;
    user: { id: string; name: string; email: string; image: string | null };
  }>;
  invites: Array<{ id: string; email: string; role: Role; expiresAt: string }>;
  projects: Array<{ id: string; name: string; identifier: string; color: string | null }>;
}

export function MembersView(props: Props) {
  const t = useTranslations("settings.members");
  const tr = useTranslations("auth.roles");
  const relative = useRelativeTime();
  const [inviting, setInviting] = useState(false);
  const [, startTransition] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok)
        toast.error(res.message === "last_owner" ? t("lastOwner") : (res.error ?? "error"));
    });

  return (
    <div className="px-5 py-6 md:px-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-title font-semibold">{t("title")}</h2>
        <Button variant="primary" onClick={() => setInviting(true)}>
          <UserPlus />
          {t("invite")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-card border border-border">
        <table className="w-full text-body">
          <thead>
            <tr className="h-10 border-b border-border bg-surface-muted text-left text-small font-medium text-fg-muted">
              <th className="pl-4">{t("colName")}</th>
              <th>{t("colRole")}</th>
              <th className="hidden sm:table-cell">{t("colStatus")}</th>
              <th className="hidden md:table-cell">{t("colJoined")}</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {props.members.map((m) => {
              const self = m.user.id === props.currentUserId;
              const canEditOwner = props.isOwner || m.role !== "OWNER";
              return (
                <tr
                  key={m.id}
                  className={cn(
                    "h-[var(--row-height)] border-b border-border last:border-0",
                    m.status === "DEACTIVATED" && "opacity-60",
                  )}
                >
                  <td className="pl-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={m.user} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {m.user.name}
                          {self ? (
                            <span className="ml-1.5 text-small font-normal text-fg-muted">
                              ({t("you")})
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-small text-fg-muted">{m.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild disabled={!canEditOwner}>
                        <Button variant="ghost" size="sm" className="-ml-2.5">
                          {tr(m.role)}
                          <ChevronDown />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-72">
                        <DropdownMenuRadioGroup
                          value={m.role}
                          onValueChange={(role) =>
                            act(() => changeRoleAction(props.ws, { memberId: m.id, role }))
                          }
                        >
                          {ROLES.filter((r) => props.isOwner || r !== "OWNER").map((r) => (
                            <DropdownMenuRadioItem key={r} value={r} className="h-auto py-1.5">
                              <span className="flex flex-col">
                                <span className="font-medium">{tr(r)}</span>
                                <span className="text-small text-fg-muted">
                                  {t(`roleHints.${r}`)}
                                </span>
                              </span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                  <td className="hidden sm:table-cell">
                    <span
                      className={cn(
                        "rounded-[6px] px-1.5 py-0.5 text-caption font-medium",
                        m.status === "ACTIVE"
                          ? "bg-success-bg text-success-text"
                          : m.status === "INVITED"
                            ? "bg-info-bg text-info-text"
                            : "bg-neutral-150 text-fg-muted",
                      )}
                    >
                      {t(`status.${m.status}`)}
                    </span>
                  </td>
                  <td className="hidden text-fg-muted tabular md:table-cell">
                    {m.status === "INVITED" ? "—" : relative(m.joinedAt)}
                  </td>
                  <td className="pr-2 text-right">
                    {!self && canEditOwner ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="More">
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {m.status === "DEACTIVATED" ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                act(() => setMemberActiveAction(props.ws, m.id, true))
                              }
                            >
                              {t("reactivate")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              destructive
                              onSelect={() =>
                                act(() => setMemberActiveAction(props.ws, m.id, false))
                              }
                            >
                              {t("deactivate")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {props.invites.length > 0 ? (
        <>
          <h3 className="mt-8 mb-3 text-body font-semibold">{t("pending")}</h3>
          <ul className="divide-y divide-border rounded-card border border-border">
            {props.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <Mail className="size-4 text-icon" />
                <span className="min-w-0 flex-1 truncate">{i.email}</span>
                <span className="text-small text-fg-muted">{tr(i.role)}</span>
                <span className="hidden text-small text-fg-muted tabular sm:inline">
                  {t("expires", { time: relative(i.expiresAt) })}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => act(() => resendInviteAction(props.ws, i.id))}
                >
                  {t("resendInvite")}
                </Button>
                <Button
                  size="xs"
                  variant="danger-ghost"
                  onClick={() => act(() => revokeInviteAction(props.ws, i.id))}
                >
                  {t("revokeInvite")}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <InviteDialog {...props} open={inviting} onOpenChange={setInviting} />
    </div>
  );
}

function InviteDialog({
  ws,
  workspaceName,
  projects,
  isOwner,
  open,
  onOpenChange,
}: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("settings.members");
  const tc = useTranslations("common");
  const tr = useTranslations("auth.roles");
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await inviteMembersAction(ws, { emails, role, projectIds });
      if (!res.ok) return setError(res.fields?.emails?.[0] ?? res.error);
      toast.success(t("invited", { count: res.data.invited }));
      setEmails("");
      setProjectIds([]);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{t("inviteTitle")}</DialogTitle>
            <DialogDescription>
              {t("inviteDescription", { workspace: workspaceName })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-emails">{t("emails")}</Label>
              <Textarea
                id="inv-emails"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder={t("emailsPlaceholder")}
                className="min-h-20"
                autoFocus
              />
              {error ? <FieldError>{error}</FieldError> : <FieldHint>{t("emailsHint")}</FieldHint>}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-body font-medium">{t("role")}</span>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.filter((r) => isOwner || r !== "OWNER").map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    className={cn(
                      "flex flex-col items-start rounded-control border px-3 py-2 text-left focus-ring",
                      role === r
                        ? "border-sky-600 bg-sky-50"
                        : "border-border-strong hover:bg-surface-hover",
                    )}
                  >
                    <span className="text-body font-medium">{tr(r)}</span>
                    <span className="text-small text-fg-muted">{t(`roleHints.${r}`)}</span>
                  </button>
                ))}
              </div>
            </div>
            {projects.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-body font-medium">{t("projects")}</span>
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-control border border-border p-1.5">
                  {projects.map((p) => (
                    <label
                      key={p.id}
                      className="flex h-8 items-center gap-2.5 rounded-[8px] px-2 hover:bg-surface-hover"
                    >
                      <Checkbox
                        checked={projectIds.includes(p.id)}
                        onCheckedChange={(v) =>
                          setProjectIds((ids) =>
                            v === true ? [...ids, p.id] : ids.filter((id) => id !== p.id),
                          )
                        }
                      />
                      <ProjectBadge name={p.name} color={p.color} />
                      <span className="text-body">{p.name}</span>
                      <span className="text-small text-fg-muted tabular">{p.identifier}</span>
                    </label>
                  ))}
                </div>
                <FieldHint>{t("projectsHint")}</FieldHint>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{tc("cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending} disabled={!emails.trim()}>
              {t("sendInvites")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
