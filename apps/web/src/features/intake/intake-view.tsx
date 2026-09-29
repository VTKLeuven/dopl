"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlarmClock,
  FileText,
  Inbox,
  Mail,
  MessageSquare,
  Paperclip,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import type { IntakeTab } from "@dopl/shared/schemas/intake";
import type { IntakeRow } from "@/server/queries/intake";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { isTypingTarget, resolveShortcut } from "@/lib/shortcuts/registry";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shell/page-header";
import { ProjectBadge } from "@/components/shell/project-badge";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { PriorityIcon } from "@/components/icons/priority-icon";
import { ItemDetail } from "@/features/work-items/item-detail";
import { useProjectMeta } from "@/features/work-items/data";
import type { ProjectMeta } from "@/features/work-items/types";
import { useIntake, type IntakeData } from "./data";
import { TriageBar, type TriagePanel } from "./triage-bar";

const TABS = ["pending", "snoozed", "accepted", "declined", "duplicate"] as const;
const SOURCE_ICON: Record<IntakeRow["source"], React.ReactNode> = {
  FORM: <FileText />,
  IN_APP: <UserRound />,
  EMAIL: <Mail />,
  API: <Inbox />,
};

/** The project's triage queue (ROADMAP Phase 3.1). */
export function IntakeView({
  ws,
  project,
  initialTab,
  initial,
  initialMeta,
  canManage,
}: {
  ws: string;
  project: { id: string; identifier: string; name: string; color: string | null };
  initialTab: IntakeTab;
  initial: IntakeData;
  initialMeta: ProjectMeta;
  canManage: boolean;
}) {
  const t = useTranslations("intake");
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS).withDefault("pending").withOptions({ history: "replace" }),
  );
  const [peek, setPeek] = useQueryState("peek", parseAsString);
  const { data, isError, isFetching } = useIntake(
    ws,
    project.id,
    tab,
    tab === initialTab ? initial : undefined,
  );
  const { data: meta = initialMeta } = useProjectMeta(ws, project.id, initialMeta);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const counts = data?.counts;
  const [focusedRaw, setFocused] = useState(0);
  // Rows leave the list after a decision; keep the focus inside it.
  const focused = Math.min(focusedRaw, Math.max(0, rows.length - 1));
  const [panel, setPanel] = useState<TriagePanel>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const open = peek ? rows.find((r) => r.id === peek) : undefined;
  const active = open ?? rows[focused];
  const canDecide = tab === "pending" || tab === "snoozed";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target) || panel) return;
      const id = resolveShortcut(e, ["list", "triage", ...(peek ? (["peek"] as const) : [])]);
      if (!id) return;
      const move = (d: number) => {
        e.preventDefault();
        const next = Math.min(Math.max(0, focused + d), rows.length - 1);
        setFocused(next);
        if (peek && rows[next]) void setPeek(rows[next].id);
        listRef.current
          ?.querySelector(`[data-index="${next}"]`)
          ?.scrollIntoView({ block: "nearest" });
      };
      switch (id) {
        case "down":
        case "downArrow":
          return move(1);
        case "up":
        case "upArrow":
          return move(-1);
        case "open":
          if (rows[focused]) {
            e.preventDefault();
            void setPeek(rows[focused].id);
          }
          return;
        case "clear":
        case "peekClose":
          if (peek) {
            e.preventDefault();
            void setPeek(null);
          }
          return;
        case "triageAccept":
        case "triageDecline":
        case "triageDuplicate":
        case "triageSnooze":
          if (!active || !canDecide) return;
          e.preventDefault();
          if (!peek) void setPeek(active.id);
          setPanel(
            id === "triageAccept"
              ? "accept"
              : id === "triageDecline"
                ? "decline"
                : id === "triageDuplicate"
                  ? "duplicate"
                  : "snooze",
          );
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, focused, peek, panel, active, canDecide, setPeek]);

  return (
    <>
      <PageHeader
        crumbs={[
          {
            label: project.name,
            icon: <ProjectBadge name={project.name} color={project.color} size={18} />,
            href: `/${ws}/p/${project.identifier}/items`,
          },
          { label: t("title"), icon: <Inbox /> },
        ]}
        actions={
          canManage ? (
            <Button asChild variant="secondary">
              <Link href={`/${ws}/p/${project.identifier}/intake/forms` as never}>
                <Settings2 />
                {t("forms")}
              </Link>
            </Button>
          ) : null
        }
      />
      <Tabs value={tab} onValueChange={(v) => void setTab(v as IntakeTab)}>
        <TabsList className="h-[var(--toolbar-height)] shrink-0 gap-5 px-5" aria-label={t("title")}>
          {TABS.map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="h-[var(--toolbar-height)]"
              data-testid={`intake-tab-${key}`}
            >
              {t(`tab.${key}`)}
              {counts && counts[key] > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-caption tabular",
                    key === "pending"
                      ? "bg-lavender-100 text-lavender-800"
                      : "bg-neutral-150 text-fg-muted",
                  )}
                >
                  {counts[key]}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={listRef}
          className="min-h-0 flex-1 scrollbar-thin overflow-y-auto"
          role="list"
          aria-label={t(`tab.${tab}`)}
          aria-busy={isFetching || undefined}
        >
          {isError ? (
            <div className="p-5">
              <Banner tone="warning" title={t("errors.load")} />
            </div>
          ) : !data ? (
            <RowsSkeleton rows={8} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={tab === "snoozed" ? <AlarmClock /> : <Inbox />}
              title={t(`empty.${tab}.title`)}
              description={t(`empty.${tab}.body`)}
              action={
                tab === "pending" && canManage ? (
                  <Button asChild variant="secondary">
                    <Link href={`/${ws}/p/${project.identifier}/intake/forms` as never}>
                      {t("setUpForm")}
                    </Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            rows.map((r, i) => (
              <IntakeRowView
                key={r.id}
                ws={ws}
                row={r}
                index={i}
                focused={i === focused}
                selected={r.id === peek}
                onOpen={() => {
                  setFocused(i);
                  void setPeek(r.id);
                }}
              />
            ))
          )}
        </div>
        {open ? (
          <aside
            aria-label={t("number", { number: open.number })}
            data-testid="intake-peek"
            className="absolute inset-y-0 right-0 z-[30] flex w-full animate-in flex-col border-l border-border bg-surface shadow-popover duration-[var(--dur-slow)] fade-in-0 slide-in-from-right-8 md:w-[min(640px,64%)]"
          >
            <ItemDetail
              ws={ws}
              itemRef={open.workItemId}
              mode="triage"
              onClose={() => void setPeek(null)}
              header={
                <>
                  <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
                    <span className="flex size-6 items-center justify-center rounded-[7px] border border-border [&_svg]:size-3.5 [&_svg]:text-icon">
                      {SOURCE_ICON[open.source]}
                    </span>
                    <span className="text-small font-medium text-fg tabular">
                      {t("number", { number: open.number })}
                    </span>
                    <span className="min-w-0 truncate text-small text-fg-muted">
                      {open.formTitle ?? t(`source.${open.source}`)}
                    </span>
                    <Tooltip content={t("close")} shortcut="esc">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ml-auto"
                        aria-label={t("close")}
                        onClick={() => void setPeek(null)}
                      >
                        <X />
                      </Button>
                    </Tooltip>
                  </div>
                  <TriageBar
                    ws={ws}
                    row={open}
                    meta={meta}
                    tab={tab}
                    panel={panel}
                    onPanel={setPanel}
                    onDone={() => {
                      // Move on to the next request, like an inbox.
                      const next = rows[rows.indexOf(open) + 1] ?? rows[rows.indexOf(open) - 1];
                      void setPeek(next?.id ?? null);
                    }}
                  />
                </>
              }
            />
          </aside>
        ) : null}
      </div>
    </>
  );
}

function IntakeRowView({
  ws,
  row: r,
  index,
  focused,
  selected,
  onOpen,
}: {
  ws: string;
  row: IntakeRow;
  index: number;
  focused: boolean;
  selected: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("intake");
  const relative = useRelativeTime();
  const format = useFormatter();
  let trailing: React.ReactNode = null;
  if (r.status === "ACCEPTED" && r.identifier)
    trailing = (
      <Link
        href={`/${ws}/i/${r.identifier}` as never}
        onClick={(e) => e.stopPropagation()}
        className="text-small font-medium text-link tabular hover:underline"
      >
        {r.identifier}
      </Link>
    );
  else if (r.status === "DUPLICATE" && r.duplicateOf)
    trailing = <span className="text-small text-fg-muted tabular">→ {r.duplicateOf}</span>;
  else if (r.snoozedUntil && new Date(r.snoozedUntil) > new Date())
    trailing = (
      <span className="inline-flex items-center gap-1 text-small text-fg-muted">
        <AlarmClock className="size-3.5" aria-hidden />
        {format.dateTime(new Date(r.snoozedUntil), {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    );
  return (
    <div
      role="listitem"
      data-index={index}
      data-testid="intake-row"
      data-focused={focused || undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      tabIndex={0}
      aria-current={selected || undefined}
      className={cn(
        "group/row flex h-[var(--row-height)] cursor-default items-center gap-3 border-b border-border px-5 text-body focus-ring",
        "transition-colors duration-[var(--dur-fast)]",
        selected ? "bg-surface-selected" : focused ? "bg-surface-hover" : "hover:bg-surface-hover",
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] border border-border bg-surface [&_svg]:size-3.5 [&_svg]:text-icon">
        {SOURCE_ICON[r.source]}
      </span>
      <span className="w-10 shrink-0 text-small text-fg-muted tabular">#{r.number}</span>
      <PriorityIcon priority={r.priority} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium text-fg">{r.title}</span>
      {r.status === "DECLINED" && r.declineReason ? (
        <span className="hidden max-w-[28%] truncate text-small text-fg-muted lg:block">
          {r.declineReason}
        </span>
      ) : null}
      <span className="hidden max-w-[22%] min-w-0 items-center gap-1.5 truncate text-small text-fg-secondary md:flex">
        <span className="truncate">{r.submitter?.name ?? t("unknownSubmitter")}</span>
        {r.formTitle ? <span className="truncate text-fg-muted">· {r.formTitle}</span> : null}
      </span>
      {r.attachmentCount > 0 ? (
        <span className="inline-flex items-center gap-0.5 text-small text-fg-muted tabular">
          <Paperclip className="size-3.5" aria-hidden />
          {r.attachmentCount}
        </span>
      ) : null}
      {r.commentCount > 0 ? (
        <span className="inline-flex items-center gap-0.5 text-small text-fg-muted tabular">
          <MessageSquare className="size-3.5" aria-hidden />
          {r.commentCount}
        </span>
      ) : null}
      {trailing}
      <span className="w-24 shrink-0 text-right text-small whitespace-nowrap text-fg-muted tabular">
        {relative(r.createdAt)}
      </span>
    </div>
  );
}
