"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, Menu } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { openMobileNav } from "./nav-events";

export interface Crumb {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

/** Spott-style header: breadcrumb left, secondary actions + one primary right. */
export function PageHeader({
  crumbs,
  actions,
  className,
}: {
  crumbs: Crumb[];
  actions?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("shell");
  return (
    <header
      className={cn(
        "flex h-[var(--header-height)] shrink-0 items-center gap-3 border-b border-border px-4 md:px-5",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="-ml-1 md:hidden"
        aria-label={t("openMenu")}
        onClick={openMobileNav}
      >
        <Menu />
      </Button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const content = (
            <span
              className={cn(
                "inline-flex min-w-0 items-center gap-2",
                "[&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-icon",
              )}
            >
              {c.icon}
              <span className="truncate">{c.label}</span>
            </span>
          );
          return (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? (
                <ChevronRight className="size-4 shrink-0 text-fg-placeholder" aria-hidden />
              ) : null}
              {c.href && !last ? (
                <Link
                  href={c.href as never}
                  className="min-w-0 rounded-[6px] text-nav text-fg-muted focus-ring hover:text-fg"
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("min-w-0 text-nav", last ? "font-medium text-fg" : "text-fg-muted")}
                >
                  {content}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
