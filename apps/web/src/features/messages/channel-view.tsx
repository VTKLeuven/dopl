"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  Ellipsis,
  FolderKanban,
  Hash,
  Lock,
  LogOut,
  Pencil,
  Users,
  X,
} from "lucide-react";
import { isTypingTarget, resolveShortcut } from "@/lib/shortcuts/registry";
import { AvatarStack } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectBadge } from "@/components/shell/project-badge";
import {
  hideDmAction,
  joinChannelAction,
  leaveChannelAction,
  setChannelArchivedAction,
} from "@/server/actions/messages";
import { chatKeys, unwrap, useChannel, useMarkRead, useMessages, usePeople } from "./data";
import { Composer } from "./composer";
import { CreateItemFromMessageDialog, EditChannelDialog, MembersDialog } from "./dialogs";
import { MessageList, MessagesSkeleton } from "./message-list";
import { ThreadPanel } from "./thread-panel";
import { TypingLine } from "./typing-line";
import type { ChannelDetail, MessageView } from "./types";

/** One conversation: header, messages, composer, and the thread panel (?thread=). */
export function ChannelView({ ws, channelId }: { ws: string; channelId: string }) {
  const t = useTranslations("messages");
  const channel = useChannel(ws, channelId);
  if (channel.isError)
    return (
      <div className="flex flex-1 items-start p-6">
        <Banner tone="warning" title={t("errors.channel")}>
          <Link href={`/${ws}/messages` as never} className="text-link">
            {t("backToMessages")}
          </Link>
        </Banner>
      </div>
    );
  if (!channel.data) return <ChannelSkeleton />;
  return <Conversation ws={ws} channel={channel.data} />;
}

function Conversation({ ws, channel }: { ws: string; channel: ChannelDetail }) {
  const t = useTranslations("messages");
  const router = useRouter();
  const qc = useQueryClient();
  const allPeople = usePeople(ws).data;
  const [thread, setThread] = useQueryState("thread");
  const [msg] = useQueryState("msg");
  const [creating, setCreating] = useState<MessageView | null>(null);
  const [dialog, setDialog] = useState<null | "members" | "edit">(null);
  // Where "New messages" goes: what you had read when you opened it.
  const [unreadAfter] = useState(channel.lastReadAt);
  const people = useMemo(
    () => (channel.openToWorkspace ? (allPeople ?? channel.members) : channel.members),
    [allPeople, channel.members, channel.openToWorkspace],
  );
  const me =
    people.find((p) => p.id === channel.me) ??
    channel.members.find((p) => p.id === channel.me) ??
    null;
  const dm = channel.kind === "DM" || channel.kind === "GROUP_DM";
  const withAgent = dm && channel.members.some((m) => m.kind === "AGENT");

  // Reading: while the tab is visible, move lastReadAt to the newest message.
  const messages = useMessages(ws, channel.id);
  const newest = messages.data?.pages[0]?.messages.at(-1)?.createdAt ?? null;
  const markRead = useMarkRead(ws);
  const sent = useRef<string | null>(channel.lastReadAt);
  useEffect(() => {
    const read = () => {
      if (!newest || document.visibilityState !== "visible") return;
      if (sent.current && sent.current >= newest) return;
      sent.current = newest;
      markRead.mutate({ channelId: channel.id, at: newest });
    };
    const timer = setTimeout(read, 300);
    document.addEventListener("visibilitychange", read);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, [newest, channel.id, markRead]);

  // Esc closes the thread (messages scope in the registry).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (resolveShortcut(e, ["messages"]) !== "msgCloseThread" || !thread) return;
      if (
        isTypingTarget(e.target) &&
        !(e.target as HTMLElement).closest("[data-testid=thread-panel]")
      )
        return;
      e.preventDefault();
      void setThread(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [thread, setThread]);

  const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.all(ws) });
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    try {
      await fn();
      void refresh();
      after?.();
    } catch {
      toast.error(t("errors.generic"));
    }
  };
  const icon =
    channel.kind === "PROJECT" && channel.project ? (
      <ProjectBadge name={channel.project.name} color={channel.project.color} size={18} />
    ) : dm ? (
      <Users className="size-[18px] text-icon" />
    ) : channel.isPrivate ? (
      <Lock className="size-[18px] text-icon" />
    ) : (
      <Hash className="size-[18px] text-icon" />
    );
  const placeholder = dm
    ? t("messageDm", { name: channel.name })
    : t("messageChannel", { name: channel.name });

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="channel-view">
        <header className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-border px-4 md:px-5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-1 md:hidden"
            asChild
            aria-label={t("backToMessages")}
          >
            <Link href={`/${ws}/messages` as never}>
              <ArrowLeft />
            </Link>
          </Button>
          <span className="flex shrink-0 items-center">{icon}</span>
          <h1
            className="min-w-0 shrink-0 truncate text-nav font-medium text-fg"
            data-testid="channel-name"
          >
            {channel.name}
          </h1>
          {channel.topic ? (
            <p className="hidden min-w-0 truncate border-l border-border pl-2 text-small text-fg-muted sm:block">
              {channel.topic}
            </p>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setDialog("members")}
              className="flex h-8 items-center gap-1.5 rounded-control px-1.5 focus-ring hover:bg-surface-hover"
              aria-label={t("members", { count: channel.members.length })}
              data-testid="members-button"
            >
              <AvatarStack users={channel.members} max={3} size="xs" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("more")}>
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {channel.can.manage ? (
                  <DropdownMenuItem onSelect={() => setDialog("edit")}>
                    <Pencil />
                    {t("editChannel")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => setDialog("members")}>
                  <Users />
                  {t("viewMembers")}
                </DropdownMenuItem>
                {channel.project ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      router.push(`/${ws}/p/${channel.project?.identifier}/items` as never)
                    }
                  >
                    <FolderKanban />
                    {t("openProject")}
                  </DropdownMenuItem>
                ) : null}
                {channel.can.leave || (channel.can.manage && channel.kind === "CUSTOM") || dm ? (
                  <DropdownMenuSeparator />
                ) : null}
                {channel.can.manage && channel.kind === "CUSTOM" ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      void run(() =>
                        unwrap(setChannelArchivedAction(ws, channel.id, !channel.archivedAt)),
                      )
                    }
                  >
                    <Archive />
                    {channel.archivedAt ? t("unarchiveChannel") : t("archiveChannel")}
                  </DropdownMenuItem>
                ) : null}
                {channel.can.leave ? (
                  <DropdownMenuItem
                    destructive
                    onSelect={() =>
                      void run(
                        () => unwrap(leaveChannelAction(ws, channel.id)),
                        () => router.push(`/${ws}/messages` as never),
                      )
                    }
                  >
                    <LogOut />
                    {t("leave")}
                  </DropdownMenuItem>
                ) : null}
                {dm ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      void run(
                        () => unwrap(hideDmAction(ws, channel.id)),
                        () => router.push(`/${ws}/messages` as never),
                      )
                    }
                  >
                    <X />
                    {t("closeDm")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {channel.archivedAt ? (
          <div className="px-5 pt-3">
            <Banner tone="info" title={t("archivedBanner")} />
          </div>
        ) : null}
        {withAgent ? (
          <div className="px-5 pt-3">
            <Banner tone="info" title={t("agentDmTitle")}>
              {t("agentDm")}
            </Banner>
          </div>
        ) : null}
        <MessageList
          ws={ws}
          channel={channel}
          people={people}
          highlightId={msg}
          unreadAfter={unreadAfter}
          onOpenThread={(id) => void setThread(id)}
          onCreateItem={channel.can.post ? setCreating : undefined}
        />
        <div className="shrink-0 px-4 pb-4 md:px-5">
          <TypingLine ws={ws} channelId={channel.id} threadRootId={null} me={channel.me} />
          {channel.can.post ? (
            <>
              {channel.can.join ? (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-control border border-border bg-surface-muted px-3 py-2 text-small text-fg-secondary">
                  <span>{t("notMember", { name: channel.name })}</span>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => void run(() => unwrap(joinChannelAction(ws, channel.id)))}
                  >
                    {t("join")}
                  </Button>
                </div>
              ) : null}
              <Composer
                key={channel.id}
                ws={ws}
                channelId={channel.id}
                threadRootId={null}
                people={people}
                me={me}
                placeholder={placeholder}
                autoFocus
              />
            </>
          ) : (
            <p className="rounded-control border border-border bg-surface-muted px-3 py-2.5 text-center text-small text-fg-muted">
              {t("readOnly")}
            </p>
          )}
        </div>
      </div>
      {thread ? (
        <ThreadPanel
          key={thread}
          ws={ws}
          channel={channel}
          rootId={thread}
          people={people}
          me={me}
          highlightId={msg}
          onClose={() => void setThread(null)}
          onCreateItem={channel.can.post ? setCreating : undefined}
        />
      ) : null}
      <CreateItemFromMessageDialog
        ws={ws}
        message={creating}
        defaultProjectId={channel.project?.id ?? null}
        onOpenChange={(o) => {
          if (!o) setCreating(null);
        }}
      />
      {dialog === "members" ? (
        <MembersDialog
          ws={ws}
          channel={channel}
          open
          onOpenChange={(o) => setDialog(o ? "members" : null)}
        />
      ) : null}
      {dialog === "edit" ? (
        <EditChannelDialog
          ws={ws}
          channel={channel}
          open
          onOpenChange={(o) => setDialog(o ? "edit" : null)}
        />
      ) : null}
    </div>
  );
}

export function ChannelSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-hidden>
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-border px-5">
        <Skeleton className="size-[18px] rounded-[5px]" />
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="ml-auto h-6 w-16 rounded-full" />
      </div>
      <MessagesSkeleton />
      <div className="shrink-0 px-5 pb-4">
        <div className="h-5" />
        <Skeleton className="h-[74px] rounded-card" />
      </div>
    </div>
  );
}
