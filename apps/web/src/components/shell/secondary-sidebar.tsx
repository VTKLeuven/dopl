"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  FOLDED_COOKIE,
  parseFolded,
  serializeFolded,
  type SidebarArea,
} from "@/lib/folded-sidebar";
import { isTypingTarget, keysFor, resolveShortcut } from "@/lib/shortcuts/registry";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

const FoldedContext = createContext(false);

/**
 * Whether the column is folded to icons. Folding only shows from `md` up:
 * below that a column is hidden, a row of tabs or the whole screen, and keeps
 * its labels. So everything that reacts to it uses `md:` classes.
 */
export const useSidebarFolded = () => useContext(FoldedContext);

function remember(area: SidebarArea, folded: boolean) {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${FOLDED_COOKIE}=`))
    ?.slice(FOLDED_COOKIE.length + 1);
  const areas = parseFolded(raw);
  if (folded) areas.add(area);
  else areas.delete(area);
  document.cookie = areas.size
    ? `${FOLDED_COOKIE}=${serializeFolded(areas)}; path=/; max-age=31536000; samesite=lax`
    : `${FOLDED_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * A page's secondary column (Mail's views, Notes, Settings, Analytics,
 * Messages; D-137). It folds to a rail of icons, with `[` or the button at the
 * bottom, so the page gets the room. Each page remembers its own choice.
 */
export function SecondarySidebar({
  area,
  initialFolded,
  label,
  className,
  width = "md:w-56",
  bodyClassName,
  header,
  children,
  testId,
}: {
  area: SidebarArea;
  /** From the cookie, read by the page's server loader (`sidebarFolded`). */
  initialFolded: boolean;
  label: string;
  /** Visibility and borders: e.g. "hidden md:flex". */
  className?: string;
  /** Unfolded width from `md` up. */
  width?: string;
  bodyClassName?: string;
  /** A bar above the scrolling list (Messages' title and compose). */
  header?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  const t = useTranslations("shell");
  const [folded, setFolded] = useState(initialFolded);
  const toggle = useCallback(() => {
    setFolded((f) => {
      remember(area, !f);
      return !f;
    });
  }, [area]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (resolveShortcut(e, ["global"]) !== "toggleSidebar") return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const action = folded ? t("unfoldSidebar") : t("foldSidebar");
  return (
    <nav
      aria-label={label}
      data-testid={testId}
      data-folded={folded || undefined}
      className={cn(
        "flex min-h-0 shrink-0 flex-col border-border md:border-r",
        folded ? "md:w-14" : width,
        className,
      )}
    >
      <FoldedContext value={folded}>
        {header}
        <div
          className={cn(
            "flex min-h-0 flex-1 scrollbar-thin flex-col gap-0.5 overflow-y-auto px-3 py-4",
            bodyClassName,
            folded && "md:px-2",
          )}
        >
          {children}
        </div>
      </FoldedContext>
      <div className={cn("hidden shrink-0 pb-3 md:flex", folded ? "justify-center" : "px-3")}>
        <Tooltip content={action} shortcut={keysFor("toggleSidebar")} side="right">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={action}
            aria-expanded={!folded}
            onClick={toggle}
            data-testid="sidebar-toggle"
          >
            {folded ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </Tooltip>
      </div>
    </nav>
  );
}

const itemClasses = (active: boolean, folded: boolean) =>
  cn(
    "relative flex h-8 min-w-0 shrink-0 items-center gap-2 rounded-control px-2.5 text-left text-body font-medium text-fg-secondary focus-ring",
    "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-icon",
    folded && "md:justify-center md:px-0",
    active ? "bg-neutral-150 text-fg [&>svg]:text-icon-strong" : "hover:bg-surface-hover",
  );

/** A count: at the end of the row, or a small badge on the icon when folded. */
function Count({ n, tone, folded }: { n: number; tone: "muted" | "accent"; folded: boolean }) {
  const accent = tone === "accent";
  const inline = (
    <span
      className={cn(
        "ml-auto text-caption font-medium tabular",
        accent ? "rounded-full bg-sky-600 px-1.5 leading-[18px] text-white" : "text-fg-muted",
        folded && "md:hidden",
      )}
    >
      {n}
    </span>
  );
  if (!folded) return inline;
  return (
    <>
      {inline}
      <span
        className={cn(
          "absolute -top-1 -right-1 hidden min-w-4 rounded-full px-1 text-center text-micro font-medium tabular ring-2 ring-surface md:block",
          accent ? "bg-sky-600 text-white" : "bg-neutral-150 text-fg-secondary",
        )}
      >
        {n > 99 ? "99+" : n}
      </span>
    </>
  );
}

/**
 * One row: icon, label, count. Folded, only the icon shows, the label moves
 * to a tooltip and the accessible name, the count to a badge.
 */
export function SidebarItem({
  icon,
  label,
  href,
  onClick,
  active = false,
  count,
  countTone = "muted",
  trailing,
  title,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  count?: number;
  countTone?: "muted" | "accent";
  /** Extra text at the end (hidden when folded). */
  trailing?: React.ReactNode;
  title?: string;
  testId?: string;
}) {
  const folded = useSidebarFolded();
  const content = (
    <>
      {icon}
      <span className={cn("truncate", folded && "md:sr-only")}>{label}</span>
      {count ? <Count n={count} tone={countTone} folded={folded} /> : null}
      {trailing && !count ? (
        <span className={cn("ml-auto", folded && "md:hidden")}>{trailing}</span>
      ) : null}
    </>
  );
  const props = {
    className: itemClasses(active, folded),
    "aria-current": active ? ("page" as const) : undefined,
    "data-testid": testId,
    title: folded ? undefined : title,
  };
  const row = href ? (
    <Link href={href as never} onClick={onClick} {...props}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} {...props}>
      {content}
    </button>
  );
  return folded ? (
    <Tooltip content={label} side="right">
      {row}
    </Tooltip>
  ) : (
    row
  );
}

/**
 * A small heading between groups of rows; folded, a little space instead (a
 * rule would dangle under a group that has nothing to show as an icon).
 */
export function SidebarHeading({
  children,
  action,
  first = false,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  /** At the top of the column: no space above. */
  first?: boolean;
  className?: string;
}) {
  const folded = useSidebarFolded();
  return (
    <>
      <div
        className={cn(
          "mb-1 flex h-6 shrink-0 items-center justify-between gap-1.5 px-2.5 text-caption font-medium text-fg-muted",
          first ? "mt-0" : "mt-5",
          className,
          folded && "md:hidden",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">{children}</span>
        {action}
      </div>
      {folded && !first ? <div aria-hidden className="hidden h-3 shrink-0 md:block" /> : null}
    </>
  );
}

/** Content that only makes sense with labels (a tag tree, an empty hint): hidden when folded. */
export function UnfoldedOnly({ children }: { children: React.ReactNode }) {
  const folded = useSidebarFolded();
  return <div className={cn("flex flex-col gap-0.5", folded && "md:hidden")}>{children}</div>;
}
