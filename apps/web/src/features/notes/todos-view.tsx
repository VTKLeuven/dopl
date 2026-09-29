"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { format, parseISO, startOfToday, endOfWeek, isBefore, isAfter } from "date-fns";
import { CircleCheck, ListChecks, SquareArrowOutUpRight, StickyNote } from "lucide-react";
import type { TodoStatus } from "@dopl/shared/schemas/notes";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { StateIcon } from "@/components/icons/state-icon";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { DatePicker } from "@/features/work-items/pickers";
import { tagClass } from "@/lib/palette";
import { useSetTodoDue, useToggleTodo, useTodos } from "./data";
import { ConvertDialog, type ConvertTarget } from "./convert-dialog";
import { NoteDialog } from "./note-dialog";
import type { Me } from "./capture";
import type { TodoRow } from "./types";

type Bucket = "overdue" | "today" | "week" | "later" | "noDate";
const BUCKETS: Bucket[] = ["overdue", "today", "week", "later", "noDate"];

function bucketOf(due: string | null): Bucket {
  if (!due) return "noDate";
  const d = parseISO(due);
  const today = startOfToday();
  if (isBefore(d, today)) return "overdue";
  if (!isAfter(d, today)) return "today";
  return isAfter(d, endOfWeek(today, { weekStartsOn: 1 })) ? "later" : "week";
}

/** One checkbox line from a note: toggle, due date, convert, open the note. */
export function TodoLine({
  ws,
  me,
  row,
  onOpenNote,
  onConvert,
  compact = false,
}: {
  ws: string;
  me: string;
  row: TodoRow;
  onOpenNote: (noteId: string) => void;
  onConvert?: (target: ConvertTarget) => void;
  compact?: boolean;
}) {
  const t = useTranslations("notes.todos");
  const toggle = useToggleTodo(ws, me);
  const setDue = useSetTodoDue(ws);
  return (
    <li
      data-testid="todo-row"
      data-block-id={row.blockId}
      className={cn(
        "group/row flex items-center gap-3 border-b border-border px-4 last:border-0 hover:bg-surface-hover",
        compact ? "h-10" : "h-12",
      )}
    >
      <Checkbox
        checked={row.checked}
        disabled={Boolean(row.workItem)}
        aria-label={row.text || t("untitled")}
        onCheckedChange={(v) =>
          toggle.mutate({ noteId: row.noteId, blockId: row.blockId, checked: v === true })
        }
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-body",
          (row.checked || row.workItem) && "text-fg-muted line-through",
        )}
      >
        {row.text || <span className="text-fg-placeholder">{t("untitled")}</span>}
      </span>
      {row.workItem ? (
        <Link
          href={`/${ws}/i/${row.workItem.identifier}` as never}
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[7px] border border-border bg-surface px-1.5 text-small font-medium text-fg-secondary tabular hover:border-border-strong"
          title={row.workItem.title}
        >
          <StateIcon group={row.workItem.stateGroup} size={12} />
          {row.workItem.identifier}
        </Link>
      ) : null}
      {!compact ? (
        <button
          type="button"
          onClick={() => onOpenNote(row.noteId)}
          className="hidden max-w-[220px] shrink-0 items-center gap-1.5 truncate rounded-[7px] px-1.5 py-0.5 text-small text-fg-muted hover:bg-neutral-150 hover:text-fg sm:inline-flex"
          title={t("openNote")}
        >
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full border",
              row.note.color ? tagClass(row.note.color).pill : "border-border-strong bg-surface",
            )}
          />
          <span className="truncate">{row.note.title || t("untitledNote")}</span>
        </button>
      ) : null}
      {!row.workItem && !row.checked ? (
        <>
          <DatePicker
            value={row.dueDate}
            label={t("due")}
            onChange={(dueDate) => setDue.mutate({ todoId: row.id, dueDate })}
          />
          {onConvert ? (
            <Tooltip content={t("convert")}>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("convert")}
                className="reveal-on-row-hover"
                onClick={() =>
                  onConvert({ kind: "todo", noteId: row.noteId, blockId: row.blockId, text: row.text })
                }
              >
                <SquareArrowOutUpRight />
              </Button>
            </Tooltip>
          ) : null}
        </>
      ) : row.dueDate && !row.workItem ? (
        <span className="shrink-0 text-small text-fg-muted tabular">
          {format(parseISO(row.dueDate), "d MMM")}
        </span>
      ) : null}
    </li>
  );
}

export function TodoListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className="overflow-hidden rounded-card border border-border">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex h-12 items-center gap-3 border-b border-border px-4 last:border-0">
          <Skeleton className="size-4 rounded-[4px]" />
          <Skeleton className="h-3.5" style={{ width: `${35 + ((i * 23) % 30)}%` }} />
          <Skeleton className="ml-auto h-3 w-24" />
        </li>
      ))}
    </ul>
  );
}

/** "My to-dos": every checkbox line across my notes, by due date. */
export function TodosView({
  ws,
  me,
  initial,
  canConvert,
}: {
  ws: string;
  me: Me;
  initial: TodoRow[];
  canConvert: boolean;
}) {
  const t = useTranslations("notes.todos");
  const [, setNote] = useQueryState("note");
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(["open", "done", "converted"] as const).withDefault("open"),
  );
  const { data: rows, isError, refetch } = useTodos(
    ws,
    status,
    status === "open" ? initial : undefined,
  );
  const [convert, setConvert] = useState<ConvertTarget | null>(null);
  const open = (id: string) => void setNote(id);

  const groups =
    status === "open"
      ? BUCKETS.map((b) => ({ b, rows: (rows ?? []).filter((r) => bucketOf(r.dueDate) === b) }))
      : [{ b: null, rows: rows ?? [] }];

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-title-lg font-semibold">{t("title")}</h1>
          <p className="mt-0.5 text-body text-fg-muted">{t("subtitle")}</p>
        </div>
        <SegmentedControl
          label={t("statusLabel")}
          value={status}
          onValueChange={(v) => void setStatus(v as TodoStatus)}
        >
          {(["open", "done", "converted"] as const).map((s) => (
            <SegmentedControlItem key={s} value={s} data-testid={`todos-${s}`}>
              {t(`status.${s}`)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>

      {isError && !rows ? (
        <Banner
          tone="warning"
          title={t("error")}
          action={
            <Button size="sm" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          }
        />
      ) : !rows ? (
        <TodoListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={status === "open" ? <CircleCheck /> : <ListChecks />}
          title={t(`empty.${status}Title`)}
          description={t(`empty.${status}`)}
          action={
            status === "open" ? (
              <Button variant="secondary" asChild>
                <Link href={`/${ws}/notes` as never}>
                  <StickyNote />
                  {t("goToNotes")}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        groups.map(({ b, rows: list }) =>
          list.length === 0 ? null : (
            <section key={b ?? "all"} className="flex flex-col gap-2">
              {b ? (
                <h2
                  className={cn(
                    "flex items-center gap-2 text-body font-semibold",
                    b === "overdue" && "text-danger-text",
                  )}
                >
                  {t(`bucket.${b}`)}
                  <span className="text-small font-normal text-fg-muted tabular">{list.length}</span>
                </h2>
              ) : null}
              <ul className="overflow-hidden rounded-card border border-border" data-testid="todo-list">
                {list.map((r) => (
                  <TodoLine
                    key={r.id}
                    ws={ws}
                    me={me.id}
                    row={r}
                    onOpenNote={open}
                    onConvert={canConvert ? setConvert : undefined}
                  />
                ))}
              </ul>
            </section>
          ),
        )
      )}
      <ConvertDialog ws={ws} me={me.id} target={convert} onClose={() => setConvert(null)} />
      <NoteDialog ws={ws} me={me} />
    </div>
  );
}
