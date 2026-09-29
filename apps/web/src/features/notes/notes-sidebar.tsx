"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Archive,
  ChevronRight,
  Ellipsis,
  GitMerge,
  Hash,
  ListChecks,
  Pencil,
  Pin,
  Repeat2,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotesSummary, useTags } from "./data";
import { TagDialog, type TagDialogState } from "./tag-dialogs";
import type { NotesSummary, TagRow } from "./types";
import { useNotesUrl, type GridFilter } from "./url";

export interface TagNode {
  tag: TagRow;
  children: TagNode[];
  /** Notes using this tag or any tag below it (a note with two sub-tags counts twice). */
  total: number;
}

/** Flat tag rows (sorted by path) → a tree by parent path. */
export function buildTagTree(rows: TagRow[]): TagNode[] {
  const byPath = new Map<string, TagNode>();
  const roots: TagNode[] = [];
  for (const tag of [...rows].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const node: TagNode = { tag, children: [], total: tag.count };
    byPath.set(tag.path, node);
    const parent = tag.path.includes("/")
      ? byPath.get(tag.path.slice(0, tag.path.lastIndexOf("/")))
      : undefined;
    (parent ? parent.children : roots).push(node);
  }
  const sum = (n: TagNode): number => (n.total = n.tag.count + n.children.reduce((s, c) => s + sum(c), 0));
  roots.forEach(sum);
  return roots;
}

const rowClasses = (active: boolean) =>
  cn(
    "group/row flex h-8 w-full items-center gap-2 rounded-control px-2.5 text-left text-body font-medium text-fg-secondary focus-ring",
    "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-icon",
    active ? "bg-neutral-150 text-fg [&>svg]:text-icon-strong" : "hover:bg-surface-hover",
  );

function Count({ n, tone = "muted" }: { n: number | undefined; tone?: "muted" | "accent" }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "ml-auto text-caption font-medium tabular",
        tone === "accent"
          ? "rounded-full bg-sky-600 px-1.5 leading-[18px] text-white"
          : "text-fg-muted",
      )}
    >
      {n}
    </span>
  );
}

/** The Notes page's secondary column: filters, to-dos, review and the tag tree. */
export function NotesSidebar({
  ws,
  initialSummary,
  initialTags,
}: {
  ws: string;
  initialSummary?: NotesSummary;
  initialTags?: TagRow[];
}) {
  const t = useTranslations("notes");
  const pathname = usePathname();
  const url = useNotesUrl(ws);
  const { data: summary } = useNotesSummary(ws, initialSummary);
  const { data: tags = [] } = useTags(ws, initialTags);
  const tree = useMemo(() => buildTagTree(tags), [tags]);
  const [dialog, setDialog] = useState<TagDialogState | null>(null);

  const filterActive = (f: GridFilter) => url.onGrid && url.filter === f && !url.tag;
  const filters: Array<{ f: GridFilter; icon: React.ReactNode; count?: number }> = [
    { f: "all", icon: <StickyNote />, count: summary?.counts.all },
    { f: "pinned", icon: <Pin />, count: summary?.counts.pinned },
    { f: "shared", icon: <Users />, count: summary?.counts.shared },
  ];

  return (
    <nav
      aria-label={t("title")}
      data-testid="notes-sidebar"
      className="hidden w-60 shrink-0 scrollbar-thin flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4 md:flex"
    >
      {filters.map(({ f, icon, count }) => (
        <button
          key={f}
          type="button"
          className={rowClasses(filterActive(f))}
          aria-current={filterActive(f) ? "page" : undefined}
          onClick={() => url.go({ filter: f })}
        >
          {icon}
          <span className="truncate">{t(`filter.${f}`)}</span>
          <Count n={count} />
        </button>
      ))}
      <Link
        href={`/${ws}/notes/todos` as never}
        className={rowClasses(pathname === `/${ws}/notes/todos`)}
        aria-current={pathname === `/${ws}/notes/todos` ? "page" : undefined}
      >
        <ListChecks />
        <span className="truncate">{t("nav.todos")}</span>
        <Count n={summary?.openTodos} />
      </Link>
      <Link
        href={`/${ws}/notes/review` as never}
        className={rowClasses(pathname === `/${ws}/notes/review`)}
        aria-current={pathname === `/${ws}/notes/review` ? "page" : undefined}
        data-testid="nav-review"
      >
        <Repeat2 />
        <span className="truncate">{t("nav.review")}</span>
        <Count n={summary?.reviewLeft} tone="accent" />
      </Link>

      <div className="mt-5 mb-1 flex h-6 items-center px-2.5">
        <span className="text-caption font-medium text-fg-muted">{t("tags.title")}</span>
      </div>
      {tree.length === 0 ? (
        <p className="px-2.5 py-1 text-small text-fg-muted">{t("tags.empty")}</p>
      ) : (
        <ul role="tree" aria-label={t("tags.title")} data-testid="tag-tree">
          {tree.map((node) => (
            <TagTreeNode
              key={node.tag.id}
              node={node}
              depth={0}
              active={url.onGrid ? url.tag : null}
              onSelect={(path) => url.go({ filter: "all", tag: path })}
              onAction={setDialog}
            />
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-0.5 pt-5">
        {(["archived", "trash"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={rowClasses(filterActive(f))}
            aria-current={filterActive(f) ? "page" : undefined}
            onClick={() => url.go({ filter: f })}
          >
            {f === "archived" ? <Archive /> : <Trash2 />}
            <span className="truncate">{t(`filter.${f}`)}</span>
            <Count n={summary?.counts[f]} />
          </button>
        ))}
      </div>
      <TagDialog ws={ws} state={dialog} tags={tags} onClose={() => setDialog(null)} />
    </nav>
  );
}

function TagTreeNode({
  node,
  depth,
  active,
  onSelect,
  onAction,
}: {
  node: TagNode;
  depth: number;
  active: string | null;
  onSelect: (path: string) => void;
  onAction: (s: TagDialogState) => void;
}) {
  const t = useTranslations("notes.tags");
  const [open, setOpen] = useState(true);
  const isActive = active === node.tag.path;
  const hasChildren = node.children.length > 0;
  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? open : undefined}
      aria-selected={isActive}
      data-tag-path={node.tag.path}
    >
      <div
        className={cn(rowClasses(isActive), "relative gap-1 pr-1")}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? t("collapse") : t("expand")}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-icon hover:bg-neutral-200"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform duration-[var(--dur-fast)]",
                open && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="size-5 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.tag.path)}
          aria-current={isActive ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
        >
          <Hash className="size-3.5 shrink-0 text-icon" />
          <span className="truncate">{node.tag.name}</span>
        </button>
        <span className="text-caption font-medium text-fg-muted tabular group-hover/row:hidden group-has-[[data-state=open]]/row:hidden">
          {node.total || ""}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("actions", { name: node.tag.path })}
              className="hidden size-6 group-hover/row:inline-flex data-[state=open]:inline-flex"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onAction({ mode: "rename", tag: node.tag, total: node.total })}>
              <Pencil />
              {t("rename")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction({ mode: "merge", tag: node.tag, total: node.total })}>
              <GitMerge />
              {t("merge")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => onAction({ mode: "delete", tag: node.tag, total: node.total })}
            >
              <Trash2 />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {hasChildren && open ? (
        <ul role="group">
          {node.children.map((c) => (
            <TagTreeNode
              key={c.tag.id}
              node={c}
              depth={depth + 1}
              active={active}
              onSelect={onSelect}
              onAction={onAction}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function NotesSidebarSkeleton() {
  return (
    <div
      aria-hidden
      className="hidden w-60 shrink-0 flex-col gap-2 border-r border-border px-5 py-5 md:flex"
    >
      {[70, 50, 80, 60, 64].map((w, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
      ))}
      <Skeleton className="mt-6 h-3 w-12" />
      {[55, 40, 62].map((w, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
