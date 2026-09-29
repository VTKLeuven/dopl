"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Compass, Hash, Lock, MessageSquarePlus, Plus, SquarePen, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { resolveShortcut, isTypingTarget } from "@/lib/shortcuts/registry";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectBadge } from "@/components/shell/project-badge";
import { useChannels } from "./data";
import { BrowseChannelsDialog, NewChannelDialog, NewDmDialog } from "./dialogs";
import type { ChannelListItem } from "./types";

/**
 * The Messages column: channels you're in, project channels, and direct
 * messages, with unread state (bold + count/dot) and ⌥↑/⌥↓ to move
 * between conversations.
 */
export function ChannelSidebar({ ws, me }: { ws: string; me: string }) {
  const t = useTranslations("messages");
  const router = useRouter();
  const params = useParams<{ channelId?: string }>();
  const activeId = params.channelId ?? null;
  const { data, isPending, isError } = useChannels(ws);
  const [dialog, setDialog] = useState<null | "channel" | "browse" | "dm">(null);

  const ordered = useMemo(
    () => (data ? [...data.channels, ...data.projects, ...data.dms] : []),
    [data],
  );
  // ⌥↑ / ⌥↓ walk the list (messages scope in the registry).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const id = resolveShortcut(e, ["messages"]);
      if (id !== "msgNextChannel" && id !== "msgPrevChannel") return;
      if (isTypingTarget(e.target) && !e.altKey) return;
      const i = ordered.findIndex((c) => c.id === activeId);
      const next = ordered[i + (id === "msgNextChannel" ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      router.push(`/${ws}/messages/c/${next.id}` as never);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, activeId, router, ws]);

  const item = (c: ChannelListItem) => (
    <ChannelLink key={c.id} ws={ws} channel={c} active={c.id === activeId} />
  );

  return (
    <nav
      aria-label={t("title")}
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col border-border md:w-[260px] md:border-r",
        activeId && "hidden md:flex",
      )}
      data-testid="channel-sidebar"
    >
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-border px-4">
        <h1 className="flex-1 text-nav font-medium text-fg">{t("title")}</h1>
        <DropdownMenu>
          <Tooltip content={t("compose")}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("compose")}
                data-testid="compose"
              >
                <SquarePen />
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setDialog("dm")}>
              <MessageSquarePlus />
              {t("newMessage")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("channel")}>
              <Hash />
              {t("newChannel")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("browse")}>
              <Compass />
              {t("browseChannels")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-2 pb-4">
        {isError ? (
          <p className="px-2.5 py-3 text-small text-danger-text">{t("errors.channels")}</p>
        ) : isPending || !data ? (
          <SidebarSkeleton />
        ) : (
          <>
            <Section
              label={t("channels")}
              action={
                <Tooltip content={t("newChannel")}>
                  <button
                    type="button"
                    aria-label={t("newChannel")}
                    onClick={() => setDialog("channel")}
                    className="inline-flex size-6 items-center justify-center rounded-[7px] text-icon focus-ring hover:bg-neutral-150 hover:text-fg"
                  >
                    <Plus className="size-4" />
                  </button>
                </Tooltip>
              }
            >
              {data.channels.map(item)}
              <button
                type="button"
                onClick={() => setDialog("browse")}
                className="flex h-8 w-full items-center gap-2 rounded-control px-2.5 text-body text-fg-muted focus-ring hover:bg-surface-hover hover:text-fg"
              >
                <Compass className="size-4" />
                {t("browseChannels")}
              </button>
            </Section>
            {data.projects.length > 0 ? (
              <Section label={t("projects")}>{data.projects.map(item)}</Section>
            ) : null}
            <Section
              label={t("directMessages")}
              action={
                <Tooltip content={t("newMessage")}>
                  <button
                    type="button"
                    aria-label={t("newMessage")}
                    onClick={() => setDialog("dm")}
                    className="inline-flex size-6 items-center justify-center rounded-[7px] text-icon focus-ring hover:bg-neutral-150 hover:text-fg"
                  >
                    <Plus className="size-4" />
                  </button>
                </Tooltip>
              }
            >
              {data.dms.length ? (
                data.dms.map(item)
              ) : (
                <p className="px-2.5 py-1 text-small text-fg-muted">{t("noDms")}</p>
              )}
            </Section>
          </>
        )}
      </div>
      <NewChannelDialog
        ws={ws}
        me={me}
        open={dialog === "channel"}
        onOpenChange={(o) => setDialog(o ? "channel" : null)}
      />
      <BrowseChannelsDialog
        ws={ws}
        open={dialog === "browse"}
        onOpenChange={(o) => setDialog(o ? "browse" : null)}
        onCreate={() => setDialog("channel")}
      />
      <NewDmDialog
        ws={ws}
        me={me}
        open={dialog === "dm"}
        onOpenChange={(o) => setDialog(o ? "dm" : null)}
      />
    </nav>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <div className="mb-1 flex h-6 items-center justify-between px-2.5">
        <h2 className="text-caption font-medium text-fg-muted">{label}</h2>
        {action}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function ChannelLink({
  ws,
  channel: c,
  active,
}: {
  ws: string;
  channel: ChannelListItem;
  active: boolean;
}) {
  const t = useTranslations("messages");
  const unread = c.unread > 0 || c.mentions > 0;
  const dm = c.kind === "DM" || c.kind === "GROUP_DM";
  const icon =
    c.kind === "PROJECT" && c.project ? (
      <ProjectBadge name={c.project.name} color={c.project.color} size={16} />
    ) : c.kind === "DM" && c.people[0] ? (
      <Avatar user={c.people[0]} size="xs" />
    ) : c.kind === "GROUP_DM" ? (
      <Users className="size-4 text-icon" />
    ) : c.isPrivate ? (
      <Lock className="size-4 text-icon" />
    ) : (
      <Hash className="size-4 text-icon" />
    );
  // DMs show how many; channels show a dot, or the number of @mentions.
  const badge =
    c.mentions > 0 || (dm && c.unread > 0) ? (dm ? Math.max(c.unread, c.mentions) : c.mentions) : 0;
  return (
    <Link
      href={`/${ws}/messages/c/${c.id}` as never}
      aria-current={active ? "page" : undefined}
      data-testid="channel-link"
      data-unread={unread ? "true" : undefined}
      className={cn(
        "flex h-8 items-center gap-2 rounded-control px-2.5 text-body focus-ring transition-colors duration-[var(--dur-fast)]",
        active ? "bg-sidebar-active text-fg" : "hover:bg-surface-hover",
        unread ? "font-semibold text-fg" : "text-fg-secondary",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{c.name}</span>
      {badge > 0 ? (
        <span
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-micro font-semibold text-white tabular"
          aria-label={t("unreadCount", { count: badge })}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : unread ? (
        <span className="size-1.5 rounded-full bg-sky-600" aria-label={t("unreadDot")} />
      ) : null}
    </Link>
  );
}

function SidebarSkeleton() {
  return (
    <div className="mt-4 flex flex-col gap-2 px-2.5" aria-hidden>
      <Skeleton className="h-3 w-16" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex h-6 items-center gap-2">
          <Skeleton className="size-4 rounded-[5px]" />
          <Skeleton className="h-3" style={{ width: `${40 + ((i * 19) % 40)}%` }} />
        </div>
      ))}
      <Skeleton className="mt-3 h-3 w-20" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex h-6 items-center gap-2">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-3" style={{ width: `${35 + ((i * 23) % 40)}%` }} />
        </div>
      ))}
    </div>
  );
}
