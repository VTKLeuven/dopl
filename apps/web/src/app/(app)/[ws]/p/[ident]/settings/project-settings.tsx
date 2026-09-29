"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, Ellipsis, Plus, Settings, Trash } from "lucide-react";
import { tagColors, type TagColor } from "@dopl/shared/palette";
import { cn } from "@/lib/cn";
import { tagClasses } from "@/lib/palette";
import {
  createLabelAction,
  createStateAction,
  deleteLabelAction,
  deleteStateAction,
  removeProjectMemberAction,
  setProjectArchivedAction,
  setProjectMemberAction,
  updateLabelAction,
  updateProjectAction,
  updateStateAction,
} from "@/server/actions/project-settings";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/tag";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { StateIcon } from "@/components/icons/state-icon";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import { SettingsSection } from "@/components/settings/section";

type Group = "BACKLOG" | "UNSTARTED" | "STARTED" | "COMPLETED" | "CANCELLED";
const GROUPS: Group[] = ["BACKLOG", "UNSTARTED", "STARTED", "COMPLETED", "CANCELLED"];
const GROUP_COLORS: Record<Group, string> = { BACKLOG: "#A1A1AA", UNSTARTED: "#71717A", STARTED: "#D97706", COMPLETED: "#16A34A", CANCELLED: "#DC2626" };

interface Props {
  ws: string;
  project: { id: string; identifier: string; name: string; color: string | null; visibility: "WORKSPACE" | "PRIVATE"; guestsCanViewProject: boolean; estimateSystem: "NONE" | "POINTS" | "HOURS"; archivedAt: string | null };
  states: Array<{ id: string; name: string; group: string; color: string; isDefault: boolean; count: number }>;
  labels: Array<{ id: string; name: string; color: string; count: number }>;
  members: Array<{ id: string; name: string; email: string; image: string | null; role: "ADMIN" | "MEMBER" | "GUEST" }>;
  candidates: Array<{ id: string; name: string; email: string; image: string | null; workspaceRole: string }>;
}

export function ProjectSettings(props: Props) {
  const t = useTranslations("projectSettings");
  const { project, ws } = props;
  return (
    <>
      <PageHeader
        crumbs={[
          { label: project.name, icon: <ProjectBadge name={project.name} color={project.color} size={18} />, href: `/${ws}/p/${project.identifier}/items` },
          { label: t("title"), icon: <Settings /> },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <General {...props} />
        <States {...props} />
        <Labels {...props} />
        <Members {...props} />
        <SettingsSection title={t("danger")} description={t("archiveHint")}>
          <Button
            variant={project.archivedAt ? "secondary" : "danger-ghost"}
            className="self-start"
            onClick={async () => {
              await setProjectArchivedAction(ws, project.id, !project.archivedAt);
            }}
          >
            <Archive />
            {project.archivedAt ? t("unarchive") : t("archive")}
          </Button>
        </SettingsSection>
      </div>
    </>
  );
}

function General({ ws, project }: Props) {
  const t = useTranslations("projectSettings");
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [identifier, setIdentifier] = useState(project.identifier);
  const [color, setColor] = useState<TagColor>((project.color as TagColor) ?? "blue");
  const [visibility, setVisibility] = useState(project.visibility);
  const [guests, setGuests] = useState(project.guestsCanViewProject);
  const [estimate, setEstimate] = useState(project.estimateSystem);
  const [pending, startTransition] = useTransition();
  return (
    <SettingsSection title={t("general")}>
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ps-name">{t("name")}</Label>
          <Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ps-ident">{t("identifier")}</Label>
          <Input id="ps-ident" className="tabular uppercase" value={identifier} onChange={(e) => setIdentifier(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} />
        </div>
      </div>
      <FieldHint>{t("identifierHint", { old: project.identifier })}</FieldHint>
      <div className="flex flex-col gap-1.5">
        <span className="text-body font-medium">{t("color")}</span>
        <div className="flex flex-wrap gap-1.5">
          {tagColors.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("flex size-7 items-center justify-center rounded-[8px] border focus-ring", tagClasses[c].pill, color === c && "ring-2 ring-focus ring-offset-1")}>
              <span className={cn("size-2.5 rounded-full", tagClasses[c].dot)} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-body font-medium">{t("visibility")}</span>
        <SegmentedControl value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)} label={t("visibility")} className="self-start">
          <SegmentedControlItem value="WORKSPACE">{t("visibilityWorkspace")}</SegmentedControlItem>
          <SegmentedControlItem value="PRIVATE">{t("visibilityPrivate")}</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <label className="flex items-center justify-between gap-3 text-body">
        {t("guestsCanView")}
        <Switch checked={guests} onCheckedChange={setGuests} />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body">{t("estimates")}</span>
        <SegmentedControl value={estimate} onValueChange={(v) => setEstimate(v as typeof estimate)} label={t("estimates")}>
          {(["NONE", "POINTS", "HOURS"] as const).map((e) => (
            <SegmentedControlItem key={e} value={e}>{t(`estimateSystem.${e}`)}</SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>
      <Button
        variant="primary"
        className="self-start"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await updateProjectAction(ws, { projectId: project.id, name, identifier, color, visibility, guestsCanViewProject: guests, estimateSystem: estimate });
            if (res.ok) {
              toast.success(t("saved"));
              if (res.data.identifier !== project.identifier) router.replace(`/${ws}/p/${res.data.identifier}/settings` as never);
            } else toast.error(res.message ?? res.error);
          })
        }
      >
        {t("save")}
      </Button>
    </SettingsSection>
  );
}

function States({ ws, project, states }: Props) {
  const t = useTranslations("projectSettings");
  const [adding, setAdding] = useState<Group | null>(null);
  const [name, setName] = useState("");
  return (
    <SettingsSection title={t("states")} description={t("statesHint")}>
      {GROUPS.map((group) => {
        const inGroup = states.filter((s) => s.group === group);
        return (
          <div key={group} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-small font-medium text-fg-muted">{t(`groups.${group}`)}</span>
              <Button variant="ghost" size="icon-xs" aria-label={t("addState")} onClick={() => { setAdding(group); setName(""); }}><Plus /></Button>
            </div>
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
              {inGroup.map((s) => (
                <StateRow key={s.id} ws={ws} state={s} others={states.filter((x) => x.id !== s.id)} canDelete={inGroup.length > 1} />
              ))}
              {adding === group ? (
                <li className="px-3 py-2">
                  <form
                    className="flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const res = await createStateAction(ws, { projectId: project.id, name, group, color: GROUP_COLORS[group] });
                      if (res.ok) setAdding(null);
                    }}
                  >
                    <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("stateName")} className="h-8" onKeyDown={(e) => e.key === "Escape" && setAdding(null)} />
                    <Button type="submit" size="sm" variant="primary" disabled={!name.trim()}>{t("addState")}</Button>
                  </form>
                </li>
              ) : null}
            </ul>
          </div>
        );
      })}
    </SettingsSection>
  );
}

function StateRow({ ws, state, others, canDelete }: { ws: string; state: Props["states"][number]; others: Props["states"]; canDelete: boolean }) {
  const t = useTranslations("projectSettings");
  const [name, setName] = useState(state.name);
  return (
    <li className="flex h-11 items-center gap-2.5 px-3">
      <label className="relative inline-flex">
        <StateIcon group={state.group as Group} color={state.color} />
        <input type="color" value={state.color} onChange={(e) => void updateStateAction(ws, { id: state.id, color: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Colour" />
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== state.name && void updateStateAction(ws, { id: state.id, name: name.trim() })}
        className="min-w-0 flex-1 rounded-[6px] bg-transparent px-1 text-body outline-none focus-visible:bg-surface-muted"
        aria-label={t("stateName")}
      />
      <span className="tabular text-small text-fg-muted">{state.count}</span>
      {state.isDefault ? <span className="rounded-[6px] bg-sky-50 px-1.5 text-caption font-medium text-sky-800">{t("default")}</span> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={t("deleteState")}><Ellipsis /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!state.isDefault ? <DropdownMenuItem onSelect={() => void updateStateAction(ws, { id: state.id, isDefault: true })}>{t("makeDefault")}</DropdownMenuItem> : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("reassignTo")}</DropdownMenuLabel>
              {others.map((o) => (
                <DropdownMenuItem key={o.id} destructive onSelect={() => void deleteStateAction(ws, state.id, o.id)}>
                  <StateIcon group={o.group as Group} color={o.color} />
                  {o.name}
                </DropdownMenuItem>
              ))}
            </>
          ) : (
            <DropdownMenuLabel className="max-w-56 whitespace-normal">{t("lastInGroup")}</DropdownMenuLabel>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function Labels({ ws, project, labels }: Props) {
  const t = useTranslations("projectSettings");
  const [name, setName] = useState("");
  const [color, setColor] = useState<TagColor>("blue");
  return (
    <SettingsSection title={t("labels")} description={t("labelsHint")}>
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
        {labels.map((l) => (
          <li key={l.id} className="flex h-11 items-center gap-2.5 px-3">
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Colour"><Tag color={l.color}>{l.name}</Tag></button>
              </PopoverTrigger>
              <PopoverContent className="flex flex-wrap gap-1 p-2">
                {tagColors.map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => void updateLabelAction(ws, { id: l.id, color: c })} className={cn("size-6 rounded-[6px] border", tagClasses[c].pill)} />
                ))}
              </PopoverContent>
            </Popover>
            <span className="flex-1" />
            <span className="tabular text-small text-fg-muted">{l.count}</span>
            <Button variant="ghost" size="icon-xs" aria-label={t("remove")} onClick={() => void deleteLabelAction(ws, l.id)}><Trash /></Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await createLabelAction(ws, { projectId: project.id, name, color });
          if (res.ok) setName("");
          else toast.error(res.message === "label_exists" ? t("labelExists") : res.error);
        }}
      >
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Colour" className={cn("flex size-9 shrink-0 items-center justify-center rounded-control border", tagClasses[color].pill)}>
              <span className={cn("size-2.5 rounded-full", tagClasses[color].dot)} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="flex flex-wrap gap-1 p-2">
            {tagColors.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={cn("size-6 rounded-[6px] border", tagClasses[c].pill)} />
            ))}
          </PopoverContent>
        </Popover>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("labelName")} />
        <Button type="submit" variant="primary" disabled={!name.trim()}><Plus />{t("addLabel")}</Button>
      </form>
    </SettingsSection>
  );
}

function Members({ ws, project, members, candidates }: Props) {
  const t = useTranslations("projectSettings");
  const tr = useTranslations("auth.roles");
  const [open, setOpen] = useState(false);
  const available = candidates.filter((c) => !members.some((m) => m.id === c.id));
  return (
    <SettingsSection title={t("members")} description={t("membersHint")}>
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
        {members.map((m) => (
          <li key={m.id} className="flex h-12 items-center gap-2.5 px-3">
            <Avatar user={m} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium">{m.name}</p>
              <p className="truncate text-small text-fg-muted">{m.email}</p>
            </div>
            <SegmentedControl value={m.role} onValueChange={(role) => void setProjectMemberAction(ws, { projectId: project.id, userId: m.id, role })} label={m.name}>
              {(["ADMIN", "MEMBER", "GUEST"] as const).map((r) => (
                <SegmentedControlItem key={r} value={r}>{tr(r)}</SegmentedControlItem>
              ))}
            </SegmentedControl>
            <Button variant="ghost" size="icon-xs" aria-label={t("remove")} onClick={() => void removeProjectMemberAction(ws, project.id, m.id)}><Trash /></Button>
          </li>
        ))}
      </ul>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button className="self-start"><Plus />{t("addMember")}</Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <Command>
            <CommandInput placeholder={t("addMember")} />
            <CommandList>
              <CommandEmpty>—</CommandEmpty>
              {available.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.email}`}
                  onSelect={async () => {
                    await setProjectMemberAction(ws, { projectId: project.id, userId: c.id, role: c.workspaceRole === "GUEST" ? "GUEST" : "MEMBER" });
                    setOpen(false);
                  }}
                >
                  <Avatar user={c} size="xs" />
                  <span className="truncate">{c.name}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </SettingsSection>
  );
}
