"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronsUpDown,
  FolderKanban,
  House,
  LogOut,
  Plus,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { authClient } from "@/lib/auth-client";
import { DoplMark } from "@/components/icons/dopl-logo";
import { Avatar } from "@/components/ui/avatar";
import { Shortcut } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectBadge } from "./project-badge";
import { openCommandPalette } from "./command-palette-events";

export interface SidebarProps {
  workspace: { slug: string; name: string };
  user: { id: string; name: string; email: string; image: string | null };
  projects: Array<{ id: string; identifier: string; name: string; color: string | null }>;
  canCreateProject: boolean;
  onNavigate?: () => void;
}

function NavItem({
  href,
  icon,
  label,
  active,
  onNavigate,
  trailing,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onNavigate?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href as never}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-9 items-center gap-2.5 rounded-control px-2.5 text-nav font-medium text-fg-nav",
        "focus-ring transition-colors duration-[var(--dur-fast)] ease-out",
        "[&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-icon-strong",
        active ? "bg-sidebar-active text-fg" : "hover:bg-sidebar-hover",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  );
}

function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-5 mb-1 flex h-6 items-center justify-between px-2.5">
      <span className="text-caption font-medium text-fg-muted">{children}</span>
      {action}
    </div>
  );
}

export function Sidebar({ workspace, user, projects, canCreateProject, onNavigate }: SidebarProps) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();
  const base = `/${workspace.slug}`;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label={workspace.name} className="flex h-full flex-col px-3 pt-4 pb-3">
      <div className="flex h-8 items-center gap-2 px-1.5">
        <DoplMark size={24} />
        <span className="text-title font-bold tracking-[-0.02em] text-fg">Dopl</span>
      </div>

      <button
        type="button"
        onClick={openCommandPalette}
        className={cn(
          "mt-4 flex h-[38px] w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-2.5 text-left text-body text-fg-placeholder shadow-xs",
          "focus-ring transition-colors duration-[var(--dur-fast)] hover:border-neutral-300",
        )}
      >
        <Search className="size-4 text-icon" aria-hidden />
        <span className="flex-1">{t("search")}</span>
        <Shortcut keys="mod+k" />
      </button>

      <div className="mt-4 flex flex-col gap-0.5">
        <NavItem
          href={`${base}/home`}
          icon={<House />}
          label={t("home")}
          active={isActive(`${base}/home`)}
          onNavigate={onNavigate}
        />
        <NavItem
          href={`${base}/projects`}
          icon={<FolderKanban />}
          label={t("allProjects")}
          active={pathname === `${base}/projects`}
          onNavigate={onNavigate}
        />
      </div>

      <SectionLabel
        action={
          canCreateProject ? (
            <Tooltip content={t("newProject")}>
              <button
                type="button"
                aria-label={t("newProject")}
                onClick={() => router.push(`${base}/projects?new=true` as never)}
                className="inline-flex size-6 items-center justify-center rounded-[7px] text-icon focus-ring hover:bg-sidebar-hover hover:text-fg"
              >
                <Plus className="size-4" />
              </button>
            </Tooltip>
          ) : null
        }
      >
        {t("projects")}
      </SectionLabel>
      <div className="-mx-1 flex min-h-0 flex-1 scrollbar-thin flex-col gap-0.5 overflow-y-auto px-1">
        {projects.length === 0 ? (
          <p className="px-2.5 py-1.5 text-small text-fg-muted">{t("noProjects")}</p>
        ) : (
          projects.map((p) => {
            const href = `${base}/p/${p.identifier}`;
            return (
              <NavItem
                key={p.id}
                href={`${href}/items`}
                icon={<ProjectBadge name={p.name} color={p.color} />}
                label={p.name}
                active={isActive(href)}
                onNavigate={onNavigate}
                trailing={
                  <span className="text-caption font-medium text-fg-muted tabular opacity-0 transition-opacity group-hover:opacity-100">
                    {p.identifier}
                  </span>
                }
              />
            );
          })
        )}
      </div>

      <SectionLabel>{t("tools")}</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <NavItem
          href={`${base}/settings`}
          icon={<Settings />}
          label={t("settings")}
          active={isActive(`${base}/settings`)}
          onNavigate={onNavigate}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="mt-3 flex h-11 w-full items-center gap-2.5 rounded-control px-2 text-left focus-ring transition-colors hover:bg-sidebar-hover"
          >
            <Avatar user={user} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-fg">{user.name}</span>
              <span className="block truncate text-caption text-fg-muted">{workspace.name}</span>
            </span>
            <ChevronsUpDown className="size-4 text-icon" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => router.push(`${base}/settings/account` as never)}>
            <UserRound />
            {t("account")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await authClient.signOut();
              router.push("/sign-in");
              router.refresh();
            }}
          >
            <LogOut />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
