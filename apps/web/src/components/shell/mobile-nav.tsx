"use client";

import { useEffect, useState } from "react";
import { Dialog as D } from "radix-ui";
import { useTranslations } from "next-intl";
import { Sidebar, type SidebarProps } from "./sidebar";
import { OPEN_NAV_EVENT } from "./nav-events";

/** Below md the sidebar becomes a left drawer (DESIGN_SYSTEM §3.10). */
export function MobileNav(props: Omit<SidebarProps, "onNavigate">) {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_NAV_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_NAV_EVENT, onOpen);
  }, []);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[50] bg-neutral-900/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 md:hidden" />
        <D.Content className="fixed inset-y-0 left-0 z-[50] w-[280px] bg-canvas shadow-dialog outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left md:hidden">
          <D.Title className="sr-only">{t("openMenu")}</D.Title>
          <Sidebar {...props} onNavigate={() => setOpen(false)} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
