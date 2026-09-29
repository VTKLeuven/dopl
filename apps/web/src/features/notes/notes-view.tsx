"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Archive,
  Hash,
  ListChecks,
  Pin,
  Repeat2,
  Search,
  StickyNote,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { NoteFilter } from "@dopl/shared/schemas/notes";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CaptureComposer, type Me } from "./capture";
import { useNotes, type ListParams } from "./data";
import { NoteCardView } from "./note-card";
import { NoteDialog } from "./note-dialog";
import type { NoteCard } from "./types";
import { useNotesUrl } from "./url";

const chipLinkClass =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-chip border border-border bg-surface px-2.5 text-body text-fg-secondary focus-ring [&_svg]:size-4 [&_svg]:text-icon";

const sameParams = (a: ListParams, b: ListParams) =>
  a.filter === b.filter && (a.tag ?? null) === (b.tag ?? null) && (a.q ?? null) === (b.q ?? null);

/** Masonry via CSS columns (DESIGN_SYSTEM §4.6): 280 px cards, no JS measuring, no shift. */
export function NotesGrid({
  ws,
  me,
  cards,
  onTag,
  onOpen,
}: {
  ws: string;
  me: Me;
  cards: NoteCard[];
  onTag?: (path: string) => void;
  onOpen?: (id: string) => void;
}) {
  return (
    <div className="columns-[280px] gap-3" data-testid="notes-grid">
      {cards.map((c) => (
        <NoteCardView key={c.id} ws={ws} me={me} card={c} onTag={onTag} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function NotesGridSkeleton({ count = 9 }: { count?: number }) {
  const heights = [132, 88, 176, 104, 148, 92, 120, 164, 100];
  return (
    <div className="columns-[280px] gap-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="mb-3 flex break-inside-avoid flex-col gap-2.5 rounded-card border border-border bg-surface p-4"
          style={{ height: heights[i % heights.length] }}
        >
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="mt-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

const EMPTY_ICON: Record<NoteFilter, React.ReactNode> = {
  all: <StickyNote />,
  pinned: <Pin />,
  shared: <Users />,
  archived: <Archive />,
  trash: <Trash2 />,
  recent: <StickyNote />,
};

export function NotesView({
  ws,
  me,
  initial,
}: {
  ws: string;
  me: Me;
  initial: { params: ListParams; notes: NoteCard[] };
}) {
  const t = useTranslations("notes");
  const url = useNotesUrl(ws);
  const params: ListParams = { filter: url.filter, tag: url.tag, q: url.q };
  const [search, setSearch] = useState(url.q ?? "");
  const { q, setState } = url;
  // Debounce typing into ?q=.
  useEffect(() => {
    const next = search.trim() || null;
    if (next === (q ?? null)) return;
    const id = setTimeout(() => void setState({ q: next }), 200);
    return () => clearTimeout(id);
  }, [search, q, setState]);

  const {
    data: notes,
    isError,
    isFetching,
    refetch,
  } = useNotes(ws, params, sameParams(params, initial.params) ? initial.notes : undefined);
  const onTag = (path: string) => url.go({ filter: "all", tag: path });
  const onOpen = (id: string) => void url.setState({ note: id });
  const canCapture = (url.filter === "all" || url.filter === "pinned") && !url.q;
  const pinned = url.filter === "all" ? (notes ?? []).filter((n) => n.pinnedAt) : [];
  const rest = url.filter === "all" ? (notes ?? []).filter((n) => !n.pinnedAt) : (notes ?? []);

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-5 md:px-6">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:hidden">
        {(["all", "pinned", "shared", "archived", "trash"] as const).map((f) => (
          <Chip key={f} active={url.filter === f && !url.tag} onClick={() => url.go({ filter: f })}>
            {EMPTY_ICON[f]}
            {t(`filter.${f}`)}
          </Chip>
        ))}
        <Link href={`/${ws}/notes/todos` as never} className={chipLinkClass}>
          <ListChecks />
          {t("nav.todos")}
        </Link>
        <Link href={`/${ws}/notes/review` as never} className={chipLinkClass}>
          <Repeat2 />
          {t("nav.review")}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-[320px]">
          <span className="sr-only">{t("searchLabel")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-icon" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            data-testid="notes-search"
            className="h-8 w-full rounded-chip border border-border bg-surface pr-2.5 pl-8 text-body text-fg outline-none placeholder:text-fg-placeholder focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-sky-400/30"
          />
        </label>
        {url.filter !== "all" ? (
          <Chip active onClick={() => url.go({ filter: "all", tag: url.tag })}>
            {EMPTY_ICON[url.filter]}
            {t(`filter.${url.filter}`)}
            <X className="-mr-1" />
          </Chip>
        ) : null}
        {url.tag ? (
          <Chip active onClick={() => url.go({ filter: url.filter })} data-testid="tag-chip">
            <Hash />
            {url.tag}
            <X className="-mr-1" />
          </Chip>
        ) : null}
        {url.q && notes ? (
          <span className="text-small text-fg-muted" role="status">
            {t("results", { count: notes.length })}
          </span>
        ) : null}
      </div>

      {canCapture ? (
        <CaptureComposer ws={ws} me={me} className="mx-auto w-full max-w-[600px]" />
      ) : null}

      {url.filter === "trash" && notes && notes.length > 0 ? (
        <p className="text-small text-fg-muted">{t("trashHint")}</p>
      ) : null}

      {isError && !notes ? (
        <Banner
          tone="warning"
          title={t("errors.load")}
          action={
            <Button size="sm" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          }
        />
      ) : !notes ? (
        <NotesGridSkeleton />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={url.tag ? <Hash /> : url.q ? <Search /> : EMPTY_ICON[url.filter]}
          title={
            url.q
              ? t("empty.searchTitle")
              : url.tag
                ? t("empty.tagTitle", { tag: url.tag })
                : t(`empty.${url.filter}Title`)
          }
          description={url.q || url.tag ? t("empty.searchDescription") : t(`empty.${url.filter}`)}
        />
      ) : (
        <div className={cn("flex flex-col gap-6 transition-opacity", isFetching && "opacity-90")}>
          {pinned.length > 0 ? (
            <section aria-label={t("section.pinned")} className="flex flex-col gap-2">
              <h2 className="px-1 text-caption font-medium text-fg-muted">{t("section.pinned")}</h2>
              <NotesGrid ws={ws} me={me} cards={pinned} onTag={onTag} onOpen={onOpen} />
            </section>
          ) : null}
          {rest.length > 0 ? (
            <section aria-label={t("section.others")} className="flex flex-col gap-2">
              {pinned.length > 0 ? (
                <h2 className="px-1 text-caption font-medium text-fg-muted">
                  {t("section.others")}
                </h2>
              ) : null}
              <NotesGrid ws={ws} me={me} cards={rest} onTag={onTag} onOpen={onOpen} />
            </section>
          ) : null}
        </div>
      )}
      <NoteDialog ws={ws} me={me} onTag={onTag} />
    </div>
  );
}
