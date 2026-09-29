"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Archive,
  AlarmClock,
  Check,
  ChevronDown,
  PartyPopper,
  SquareArrowOutUpRight,
  StickyNote,
} from "lucide-react";
import { noteTitle, reviewIntervalDays, SNOOZE_OPTIONS } from "@dopl/shared/domain/notes";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { useReview, useReviewAction } from "./data";
import { NoteCardView } from "./note-card";
import { cardColorClass } from "./note-actions";
import { ConvertDialog, noteTarget, type ConvertTarget } from "./convert-dialog";
import type { Me } from "./capture";
import type { ReviewData } from "./types";

export function ReviewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 md:px-8" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-56 w-full rounded-card" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-40 rounded-control" />
        <Skeleton className="h-9 w-28 rounded-control" />
        <Skeleton className="h-9 w-24 rounded-control" />
      </div>
    </div>
  );
}

/**
 * Daily review (PROMPT §4.6): up to five older notes a day, one at a time.
 * Keep schedules the next visit 1 → 3 → 7 → 21 → 60 days out.
 */
export function ReviewView({
  ws,
  me,
  initial,
  canConvert,
}: {
  ws: string;
  me: Me;
  initial: ReviewData;
  canConvert: boolean;
}) {
  const t = useTranslations("notes.review");
  const { data, isError, refetch } = useReview(ws, initial);
  const act = useReviewAction(ws);
  const [convert, setConvert] = useState<ConvertTarget | null>(null);

  if (isError && !data)
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-6 md:px-8">
        <Banner
          tone="warning"
          title={t("error")}
          action={
            <Button size="sm" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          }
        />
      </div>
    );
  if (!data) return <ReviewSkeleton />;

  const [current, ...next] = data.notes;
  const total = Math.min(data.limit, data.doneToday + data.notes.length);
  const done = data.doneToday;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-title-lg font-semibold">{t("title")}</h1>
            <p className="mt-0.5 text-body text-fg-muted">{t("subtitle")}</p>
          </div>
          {total > 0 ? (
            <span className="shrink-0 text-small font-medium text-fg-muted tabular" role="status">
              {t("progress", { done, total })}
            </span>
          ) : null}
        </div>
        {total > 0 ? (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-neutral-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label={t("progressLabel")}
          >
            <div
              className="h-full rounded-full bg-sky-600 transition-[width] duration-[var(--dur-slow)] ease-out"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        ) : null}
      </div>

      {!current ? (
        <EmptyState
          icon={done > 0 ? <PartyPopper /> : <StickyNote />}
          title={done > 0 ? t("doneTitle") : t("emptyTitle")}
          description={
            data.dueTomorrow > 0
              ? t("tomorrow", { count: data.dueTomorrow })
              : done > 0
                ? t("doneDescription")
                : t("emptyDescription")
          }
          action={
            <Button variant="secondary" asChild>
              <Link href={`/${ws}/notes` as never}>
                <StickyNote />
                {t("backToNotes")}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div data-testid="review-current">
            <NoteCardView key={current.id} ws={ws} me={me} card={current} variant="review" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() => act.mutate({ noteId: current.id, action: "keep" })}
              data-testid="review-keep"
            >
              <Check />
              {t("keep")}
              <span className="font-normal text-on-primary/70">
                {t("nextIn", { days: reviewIntervalDays(current.reviewCount + 1) })}
              </span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" data-testid="review-snooze">
                  <AlarmClock />
                  {t("snooze")}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {SNOOZE_OPTIONS.map((days) => (
                  <DropdownMenuItem
                    key={days}
                    onSelect={() => act.mutate({ noteId: current.id, action: "snooze", days })}
                  >
                    {t("snoozeFor", { days })}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="secondary"
              onClick={() => act.mutate({ noteId: current.id, action: "archive" })}
              data-testid="review-archive"
            >
              <Archive />
              {t("archive")}
            </Button>
            {canConvert ? (
              <Button variant="ghost" onClick={() => setConvert(noteTarget(current, true))}>
                <SquareArrowOutUpRight />
                {t("convert")}
              </Button>
            ) : null}
          </div>
          {next.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-caption font-medium text-fg-muted">{t("upNext")}</h2>
              <ul className="flex flex-col gap-1.5">
                {next.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "flex h-10 items-center gap-2 rounded-control border px-3 text-body text-fg-secondary",
                      cardColorClass(n.color),
                    )}
                  >
                    <StickyNote className="size-4 shrink-0 text-icon" />
                    <span className="truncate">{noteTitle(n.contentText) || t("untitled")}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      <ConvertDialog
        ws={ws}
        me={me.id}
        target={convert}
        onClose={() => setConvert(null)}
        onConverted={() => void refetch()}
      />
    </div>
  );
}
