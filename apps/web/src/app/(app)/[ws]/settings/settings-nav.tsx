"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, Building2, KeyRound, Mail, ShieldCheck, Users, Webhook } from "lucide-react";
import { cn } from "@/lib/cn";

export function SettingsNav({ ws, isAdmin }: { ws: string; isAdmin: boolean }) {
  const t = useTranslations("settings.nav");
  const tn = useTranslations("notificationSettings");
  const pathname = usePathname();
  const items = [
    ...(isAdmin
      ? [
          { section: t("workspace") },
          { href: `/${ws}/settings/general`, label: t("general"), icon: <Building2 /> },
          { href: `/${ws}/settings/members`, label: t("members"), icon: <Users /> },
          {
            href: `/${ws}/settings/authentication`,
            label: t("authentication"),
            icon: <KeyRound />,
          },
          {
            href: `/${ws}/settings/integrations`,
            label: t("integrations"),
            icon: <Webhook />,
          },
          { href: `/${ws}/settings/mailboxes`, label: t("mailboxes"), icon: <Mail /> },
        ]
      : []),
    { section: t("you") },
    { href: `/${ws}/settings/account`, label: t("account"), icon: <ShieldCheck /> },
    { href: `/${ws}/settings/notifications`, label: tn("nav"), icon: <Bell /> },
  ];
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 py-2 md:w-56 md:flex-col md:border-r md:border-b-0 md:px-3 md:py-4">
      {items.map((item, i) =>
        "section" in item ? (
          <span
            key={i}
            className="hidden px-2.5 pt-3 pb-1 text-caption font-medium text-fg-muted first:pt-0 md:block"
          >
            {item.section}
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href as never}
            aria-current={pathname.startsWith(item.href) ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-2 rounded-control px-2.5 text-body font-medium text-fg-secondary focus-ring [&_svg]:size-4 [&_svg]:text-icon",
              pathname.startsWith(item.href) ? "bg-neutral-150 text-fg" : "hover:bg-surface-hover",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
