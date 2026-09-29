"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as D } from "radix-ui";
import { FolderKanban, House, Settings } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { OPEN_PALETTE_EVENT } from "./command-palette-events";

/** ⌘K — Phase 1: navigation. Phase 2 adds search and every action. */
export function CommandPalette() {
  const t = useTranslations("palette");
  const router = useRouter();
  const params = useParams<{ ws?: string }>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  const base = params.ws ? `/${params.ws}` : "";
  const go = (href: string) => {
    setOpen(false);
    router.push(href as never);
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-neutral-900/20 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content className="fixed top-[18vh] left-1/2 z-[60] w-[calc(100vw-32px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-panel border border-border bg-surface shadow-dialog outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]">
          <D.Title className="sr-only">{t("title")}</D.Title>
          <Command loop>
            <CommandInput placeholder={t("placeholder")} autoFocus />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>{t("empty")}</CommandEmpty>
              <CommandGroup heading={t("navigation")}>
                <CommandItem onSelect={() => go(`${base}/home`)} shortcut="g h">
                  <House className="text-icon" />
                  {t("goHome")}
                </CommandItem>
                <CommandItem onSelect={() => go(`${base}/projects`)} shortcut="g p">
                  <FolderKanban className="text-icon" />
                  {t("goProjects")}
                </CommandItem>
                <CommandItem onSelect={() => go(`${base}/settings`)}>
                  <Settings className="text-icon" />
                  {t("goSettings")}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
