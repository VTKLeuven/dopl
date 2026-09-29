"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Hash, Lock, LogOut, UserPlus, X } from "lucide-react";
import { channelSlug } from "@dopl/shared/schemas/messages";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ProjectBadge } from "@/components/shell/project-badge";
import type { PaletteData } from "@/server/queries/palette";
import {
  addChannelMembersAction,
  createChannelAction,
  createItemFromMessageAction,
  joinChannelAction,
  leaveChannelAction,
  openDmAction,
  removeChannelMemberAction,
  updateChannelAction,
} from "@/server/actions/messages";
import { chatKeys, unwrap, useBrowseChannels, usePeople } from "./data";
import type { ChannelDetail, MessageView, Person } from "./types";

/* ───────────── people picker ───────────── */

function PeoplePicker({
  people,
  selected,
  onChange,
  exclude = [],
}: {
  people: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
  exclude?: string[];
}) {
  const t = useTranslations("messages");
  const chosen = people.filter((p) => selected.includes(p.id));
  const options = people.filter((p) => !exclude.includes(p.id));
  return (
    <div className="flex flex-col gap-2">
      {chosen.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((p) => (
            <span
              key={p.id}
              className="inline-flex h-7 items-center gap-1.5 rounded-chip border border-border bg-surface-muted pr-1 pl-1.5 text-small"
            >
              <Avatar user={p} size="xs" />
              {p.name}
              <button
                type="button"
                aria-label={t("removePerson", { name: p.name })}
                className="inline-flex size-5 items-center justify-center rounded-[5px] text-icon hover:bg-neutral-150"
                onClick={() => onChange(selected.filter((id) => id !== p.id))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Command className="rounded-control border border-border-strong">
        <CommandInput placeholder={t("searchPeople")} />
        <CommandList className="max-h-56">
          <CommandEmpty>{t("noMatches")}</CommandEmpty>
          {options.map((p) => {
            const on = selected.includes(p.id);
            return (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.email}`}
                onSelect={() =>
                  onChange(on ? selected.filter((id) => id !== p.id) : [...selected, p.id])
                }
                data-testid="person-option"
              >
                <Avatar user={p} size="xs" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="truncate text-small text-fg-muted">
                  {p.kind === "AGENT" ? t("agent") : p.email}
                </span>
                <Check className={cn("size-4 text-sky-600", on ? "visible" : "invisible")} />
              </CommandItem>
            );
          })}
        </CommandList>
      </Command>
    </div>
  );
}

/* ───────────── new channel ───────────── */

export function NewChannelDialog({
  ws,
  me,
  open,
  onOpenChange,
}: {
  ws: string;
  me: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("messages");
  const router = useRouter();
  const qc = useQueryClient();
  const people = usePeople(ws).data ?? [];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const slug = channelSlug(name);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const c = await unwrap(
        createChannelAction(ws, { name, description, isPrivate, memberIds: members }),
      );
      void qc.invalidateQueries({ queryKey: chatKeys.channels(ws) });
      onOpenChange(false);
      setName("");
      setDescription("");
      setMembers([]);
      setPrivate(false);
      router.push(`/${ws}/messages/c/${c.id}` as never);
    } catch {
      setError(t("errors.createChannel"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("close")}>
        <DialogHeader>
          <DialogTitle>{t("newChannel")}</DialogTitle>
          <DialogDescription>{t("newChannelHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (slug) void submit();
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ch-name">{t("channelName")}</Label>
              <div className="relative">
                <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-icon" />
                <Input
                  id="ch-name"
                  className="pl-9"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("channelNamePlaceholder")}
                  maxLength={80}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ch-desc">
                {t("description")}{" "}
                <span className="font-normal text-fg-muted">({t("optional")})</span>
              </Label>
              <Textarea
                id="ch-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>
            <label className="flex items-start gap-3 rounded-control border border-border p-3">
              <Lock className="mt-0.5 size-4 shrink-0 text-icon" />
              <span className="flex-1">
                <span className="block text-body font-medium">{t("private")}</span>
                <span className="block text-small text-fg-muted">{t("privateHint")}</span>
              </span>
              <Switch checked={isPrivate} onCheckedChange={setPrivate} aria-label={t("private")} />
            </label>
            <div className="flex flex-col gap-1.5">
              <Label>{t("addPeople")}</Label>
              <PeoplePicker
                people={people}
                selected={members}
                onChange={setMembers}
                exclude={[me]}
              />
            </div>
            {error ? <FieldError>{error}</FieldError> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={!slug} loading={pending}>
              {t("createChannel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── browse ───────────── */

export function BrowseChannelsDialog({
  ws,
  open,
  onOpenChange,
  onCreate,
}: {
  ws: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
}) {
  const t = useTranslations("messages");
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isPending } = useBrowseChannels(ws, open);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("close")}>
        <DialogHeader>
          <DialogTitle>{t("browseChannels")}</DialogTitle>
          <DialogDescription>{t("browseHint")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="px-2">
          {isPending ? (
            <div className="flex flex-col gap-2 px-3 py-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="px-3 py-6 text-center text-body text-fg-muted">{t("noChannels")}</p>
          ) : (
            <ul className="flex flex-col">
              {data.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-control px-3 py-2 hover:bg-surface-hover"
                >
                  <Hash className="size-4 shrink-0 text-icon" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium">{c.name}</p>
                    <p className="truncate text-small text-fg-muted">
                      {t("memberCount", { count: c.memberCount })}
                      {c.description ? ` · ${c.description}` : ""}
                    </p>
                  </div>
                  {c.joined ? (
                    <Button size="xs" variant="ghost" asChild>
                      <Link
                        href={`/${ws}/messages/c/${c.id}` as never}
                        onClick={() => onOpenChange(false)}
                      >
                        {t("openChannel")}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      size="xs"
                      variant="secondary"
                      loading={busy === c.id}
                      onClick={async () => {
                        setBusy(c.id);
                        try {
                          await unwrap(joinChannelAction(ws, c.id));
                          void qc.invalidateQueries({ queryKey: chatKeys.all(ws) });
                          onOpenChange(false);
                          router.push(`/${ws}/messages/c/${c.id}` as never);
                        } catch {
                          toast.error(t("errors.generic"));
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {t("join")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              onCreate();
            }}
          >
            <Hash />
            {t("newChannel")}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── new DM ───────────── */

export function NewDmDialog({
  ws,
  me,
  open,
  onOpenChange,
}: {
  ws: string;
  me: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("messages");
  const router = useRouter();
  const qc = useQueryClient();
  const people = usePeople(ws).data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("close")}>
        <DialogHeader>
          <DialogTitle>{t("newMessage")}</DialogTitle>
          <DialogDescription>{t("newMessageHint")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <PeoplePicker people={people} selected={selected} onChange={setSelected} exclude={[me]} />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={selected.length === 0 || selected.length > 8}
            loading={pending}
            data-testid="open-dm"
            onClick={async () => {
              setPending(true);
              try {
                const dm = await unwrap(openDmAction(ws, { userIds: selected }));
                void qc.invalidateQueries({ queryKey: chatKeys.channels(ws) });
                onOpenChange(false);
                setSelected([]);
                router.push(`/${ws}/messages/c/${dm.id}` as never);
              } catch {
                toast.error(t("errors.generic"));
              } finally {
                setPending(false);
              }
            }}
          >
            {t("startConversation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── members ───────────── */

export function MembersDialog({
  ws,
  channel,
  open,
  onOpenChange,
}: {
  ws: string;
  channel: ChannelDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("messages");
  const router = useRouter();
  const qc = useQueryClient();
  const people = usePeople(ws).data ?? [];
  const [adding, setAdding] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.all(ws) });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      void refresh();
    } catch {
      toast.error(t("errors.generic"));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("close")}>
        <DialogHeader>
          <DialogTitle>{t("membersTitle", { name: channel.name })}</DialogTitle>
          <DialogDescription>
            {channel.kind === "PROJECT"
              ? t("projectMembersHint")
              : t("memberCount", { count: channel.members.length })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {showAdd ? (
            <div className="flex flex-col gap-2">
              <PeoplePicker
                people={people}
                selected={adding}
                onChange={setAdding}
                exclude={channel.members.map((m) => m.id)}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={adding.length === 0}
                  onClick={() =>
                    void run(async () => {
                      await unwrap(
                        addChannelMembersAction(ws, { channelId: channel.id, userIds: adding }),
                      );
                      setAdding([]);
                      setShowAdd(false);
                    })
                  }
                >
                  {t("add")}
                </Button>
              </div>
            </div>
          ) : null}
          <ul className="flex flex-col">
            {channel.members.map((m) => (
              <li
                key={m.id}
                className="group flex h-10 items-center gap-2.5 rounded-control px-2 hover:bg-surface-hover"
              >
                <Avatar user={m} size="sm" />
                <span className="min-w-0 flex-1 truncate text-body">
                  {m.name}
                  {m.id === channel.me ? (
                    <span className="text-fg-muted"> ({t("you")})</span>
                  ) : null}
                </span>
                {m.role === "OWNER" ? (
                  <span className="text-small text-fg-muted">{t("owner")}</span>
                ) : null}
                {channel.can.manage && channel.kind === "CUSTOM" && m.id !== channel.me ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() =>
                      void run(() => unwrap(removeChannelMemberAction(ws, channel.id, m.id)))
                    }
                  >
                    {t("remove")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter className="justify-between">
          {channel.can.leave ? (
            <Button
              variant="danger-ghost"
              onClick={() =>
                void run(async () => {
                  await unwrap(leaveChannelAction(ws, channel.id));
                  onOpenChange(false);
                  router.push(`/${ws}/messages` as never);
                })
              }
            >
              <LogOut />
              {t("leave")}
            </Button>
          ) : (
            <span />
          )}
          {channel.can.addMembers && !showAdd ? (
            <Button variant="secondary" onClick={() => setShowAdd(true)}>
              <UserPlus />
              {t("addPeople")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── edit channel ───────────── */

export function EditChannelDialog({
  ws,
  channel,
  open,
  onOpenChange,
}: {
  ws: string;
  channel: ChannelDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("messages");
  const qc = useQueryClient();
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [description, setDescription] = useState(channel.description ?? "");
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("close")}>
        <DialogHeader>
          <DialogTitle>{t("editChannel")}</DialogTitle>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              await unwrap(
                updateChannelAction(ws, {
                  id: channel.id,
                  ...(channel.kind === "CUSTOM" ? { name } : {}),
                  topic,
                  description,
                }),
              );
              void qc.invalidateQueries({ queryKey: chatKeys.all(ws) });
              onOpenChange(false);
            } catch {
              toast.error(t("errors.generic"));
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            {channel.kind === "CUSTOM" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-name">{t("channelName")}</Label>
                <Input
                  id="ed-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-topic">{t("topic")}</Label>
              <Input
                id="ed-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={250}
                placeholder={t("topicPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-desc">{t("description")}</Label>
              <Textarea
                id="ed-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── create work item from message ───────────── */

function firstLine(message: MessageView): string {
  const walk = (n: unknown): string => {
    if (!n || typeof n !== "object") return "";
    const node = n as {
      type?: string;
      text?: string;
      attrs?: Record<string, unknown>;
      content?: unknown[];
    };
    if (node.type === "text") return node.text ?? "";
    if (node.type === "mention") return `@${String(node.attrs?.label ?? "")}`;
    if (node.type === "workItemRef") return String(node.attrs?.label ?? "");
    if (node.type === "hardBreak") return "\n";
    const inner = (node.content ?? []).map(walk).join("");
    return node.type === "paragraph" || node.type === "heading" ? `${inner}\n` : inner;
  };
  return walk(message.body).trim().split("\n")[0]?.slice(0, 200) ?? "";
}

export function CreateItemFromMessageDialog({
  ws,
  message,
  defaultProjectId,
  onOpenChange,
}: {
  ws: string;
  message: MessageView | null;
  defaultProjectId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("messages");
  const router = useRouter();
  const qc = useQueryClient();
  const { data: palette } = useQuery({
    queryKey: ["palette", ws],
    queryFn: async () => {
      const res = await fetch(`/api/v1/${ws}/palette`, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as PaletteData;
    },
    staleTime: 30_000,
  });
  const projects = useMemo(() => palette?.projects ?? [], [palette]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const chosen = projectId ?? defaultProjectId ?? projects[0]?.id ?? null;
  const value = title ?? (message ? firstLine(message) : "");

  const close = () => {
    setTitle(null);
    setProjectId(null);
    onOpenChange(false);
  };
  return (
    <Dialog open={Boolean(message)} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent closeLabel={t("close")} data-testid="create-item-dialog">
        <DialogHeader>
          <DialogTitle>{t("createItem")}</DialogTitle>
          <DialogDescription>{t("createItemHint")}</DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!message || !chosen || !value.trim()) return;
            setPending(true);
            try {
              const item = await unwrap(
                createItemFromMessageAction(ws, {
                  messageId: message.id,
                  projectId: chosen,
                  title: value,
                }),
              );
              void qc.invalidateQueries({ queryKey: chatKeys.messages(ws, message.channelId) });
              void qc.invalidateQueries({
                queryKey: chatKeys.thread(ws, message.threadRootId ?? message.id),
              });
              void qc.invalidateQueries({ queryKey: ["items", chosen] });
              toast.success(t("itemCreated", { identifier: item.identifier }), {
                action: {
                  label: t("openItem"),
                  onClick: () => router.push(`/${ws}/i/${item.identifier}` as never),
                },
              });
              close();
            } catch {
              toast.error(t("errors.createItem"));
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ci-title">{t("itemTitle")}</Label>
              <Input
                id="ci-title"
                value={value}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={300}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("project")}</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("project")}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={p.id === chosen}
                    onClick={() => setProjectId(p.id)}
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-chip border px-2.5 text-body focus-ring",
                      p.id === chosen
                        ? "border-sky-300 bg-sky-50 text-sky-800"
                        : "border-border bg-surface hover:bg-surface-hover",
                    )}
                  >
                    <ProjectBadge name={p.name} color={p.color} size={16} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={pending}
              disabled={!chosen || !value.trim()}
            >
              {t("createItemSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
