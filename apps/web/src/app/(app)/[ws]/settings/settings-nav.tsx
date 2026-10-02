"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bell,
  Bot,
  Building2,
  KeyRound,
  Mail,
  ScrollText,
  ShieldCheck,
  Users,
  Webhook,
} from "lucide-react";
import {
  SecondarySidebar,
  SidebarHeading,
  SidebarItem,
} from "@/components/shell/secondary-sidebar";

export function SettingsNav({
  ws,
  isAdmin,
  initialFolded,
}: {
  ws: string;
  isAdmin: boolean;
  /** Folded to icons (D-137). */
  initialFolded: boolean;
}) {
  const t = useTranslations("settings.nav");
  const ts = useTranslations("settings");
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
          { href: `/${ws}/settings/agent`, label: t("agent"), icon: <Bot /> },
          { href: `/${ws}/settings/audit`, label: t("audit"), icon: <ScrollText /> },
        ]
      : []),
    { section: t("you") },
    { href: `/${ws}/settings/account`, label: t("account"), icon: <ShieldCheck /> },
    { href: `/${ws}/settings/notifications`, label: tn("nav"), icon: <Bell /> },
  ];
  // Phones: a row of tabs under the header. From md up: a column that folds.
  return (
    <SecondarySidebar
      area="settings"
      initialFolded={initialFolded}
      label={ts("title")}
      className="border-b md:border-b-0"
      bodyClassName="flex-row gap-1 overflow-x-auto px-4 py-2 md:flex-col md:gap-0.5 md:overflow-x-hidden md:px-3 md:py-4"
    >
      {items.map((item, i) =>
        "section" in item ? (
          <SidebarHeading key={i} first={i === 0} className="hidden md:flex">
            {item.section}
          </SidebarHeading>
        ) : (
          <SidebarItem
            key={item.href}
            icon={item.icon}
            label={item.label}
            href={item.href}
            active={pathname.startsWith(item.href)}
          />
        ),
      )}
    </SecondarySidebar>
  );
}
