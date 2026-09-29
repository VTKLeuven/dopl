"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clearPaletteItem, setPaletteItem } from "@/features/palette/context";
import { recordVisitAction } from "@/server/actions/recents";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Archive,
  Bell,
  BellOff,
  Copy,
  Ellipsis,
  Link as LinkIcon,
  Maximize2,
  Plus,
  SmilePlus,
  Trash,
  X,
  ExternalLink,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useRelativeTime } from "@/lib/use-relative-time";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Banner } from "@/components/ui/banner";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { StateIcon } from "@/components/icons/state-icon";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { RichTextView } from "@/components/editor/rich-text-view";
import { ProjectBadge } from "@/components/shell/project-badge";
import {
  addLinkAction,
  addRelationAction,
  removeLinkAction,
  removeRelationAction,
  setArchivedAction,
  setSubscribedAction,
  createWorkItemAction,
} from "@/server/actions/work-items";
import {
  createCommentAction,
  editCommentAction,
  setCommentDeletedAction,
  toggleReactionAction,
} from "@/server/actions/comments";
import {
  keys,
  useDeleteItems,
  useItemSearch,
  useProjectMeta,
  useUpdateItem,
  useWorkItemDetail,
} from "./data";
import {
  AssigneePicker,
  DatePicker,
  LabelPicker,
  PriorityPicker,
  StatePicker,
  TypePicker,
} from "./pickers";
import { useEditorSources } from "./editor-sources";
import { Attachments } from "./attachments";
import type { ActivityView, CommentView, ProjectMeta, WorkItemDetail as Detail } from "./types";

export function ItemDetail({
  ws,
  itemRef,
  mode,
  onClose,
}: {
  ws: string;
  itemRef: string;
  mode: "peek" | "page";
  onClose?: () => void;
}) {
  const { data, isError } = useWorkItemDetail(ws, itemRef);
  const { data: meta } = useProjectMeta(ws, data?.projectId ?? "", undefined);
  const t = useTranslations("items");
  // ⌘K acts on the open item; opening it also counts as a visit for "Recent".
  const itemId = data?.id;
  const identifier = data?.identifier;
  const title = data?.title;
  useEffect(() => {
    if (!itemId || !identifier || title === undefined) return;
    setPaletteItem({ id: itemId, identifier, title });
    return () => clearPaletteItem(itemId);
  }, [itemId, identifier, title]);
  useEffect(() => {
    if (itemId) void recordVisitAction(ws, { type: "WORK_ITEM", id: itemId });
  }, [ws, itemId]);
  if (isError) {
    return (
      <div className="p-6">
        <Banner tone="warning" title={t("errors.generic")} />
      </div>
    );
  }
  if (!data || !meta || meta.project.id !== data.projectId)
    return <DetailSkeleton mode={mode} onClose={onClose} />;
  return <DetailBody ws={ws} item={data} meta={meta} mode={mode} onClose={onClose} />;
}

function DetailSkeleton({ mode, onClose }: { mode: "peek" | "page"; onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col" aria-busy>
      {mode === "peek" ? (
        <div className="flex h-12 items-center gap-2 border-b border-border px-4">
          <Skeleton className="h-3 w-32" />
          {onClose ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={onClose}
              aria-label="Close"
            >
              <X />
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-6 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-chip" />
          <Skeleton className="h-6 w-20 rounded-chip" />
          <Skeleton className="h-6 w-28 rounded-chip" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

function DetailBody({
  ws,
  item,
  meta,
  mode,
  onClose,
}: {
  ws: string;
  item: Detail;
  meta: ProjectMeta;
  mode: "peek" | "page";
  onClose?: () => void;
}) {
  const t = useTranslations("items");
  const qc = useQueryClient();
  const update = useUpdateItem(ws, item.projectId);
  const del = useDeleteItems(ws, item.projectId);
  const canEdit = meta.can.edit && !item.archivedAt;
  const set = (patch: Record<string, unknown>) => update.mutate({ id: item.id, ...patch });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.relations(item.projectId) });
    return qc.invalidateQueries({ queryKey: keys.detail(item.identifier) });
  };
  const url = () => `${window.location.origin}/${ws}/i/${item.identifier}`;

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast(t("copied"));
  };

  const header = (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center gap-1 border-b border-border px-4",
        mode === "page" && "px-6",
      )}
    >
      <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-small text-fg-muted">
        <ProjectBadge name={meta.project.name} color={meta.project.color} size={16} />
        <Link
          href={`/${ws}/p/${meta.project.identifier}/items` as never}
          className="truncate hover:text-fg"
        >
          {meta.project.name}
        </Link>
        <span aria-hidden>›</span>
        <span className="font-medium text-fg tabular">{item.identifier}</span>
      </nav>
      <Tooltip content={t("copyLink")} shortcut="mod+shift+,">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("copyLink")}
          onClick={() => void copy(url())}
        >
          <LinkIcon />
        </Button>
      </Tooltip>
      {mode === "peek" ? (
        <Tooltip content={t("openFull")} shortcut="mod+enter">
          <Button variant="ghost" size="icon-sm" asChild aria-label={t("openFull")}>
            <Link href={`/${ws}/i/${item.identifier}` as never}>
              <Maximize2 />
            </Link>
          </Button>
        </Tooltip>
      ) : null}
      <Tooltip content={item.subscribed ? t("unsubscribe") : t("subscribe")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={item.subscribed ? t("unsubscribe") : t("subscribe")}
          onClick={async () => {
            await setSubscribedAction(ws, item.id, !item.subscribed);
            void refresh();
          }}
        >
          {item.subscribed ? <Bell className="text-sky-700!" /> : <BellOff />}
        </Button>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("prop.state")}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem shortcut="mod+." onSelect={() => void copy(item.identifier)}>
            <Copy />
            {t("copyId")}
          </DropdownMenuItem>
          <DropdownMenuItem shortcut="mod+shift+," onSelect={() => void copy(url())}>
            <LinkIcon />
            {t("copyLink")}
          </DropdownMenuItem>
          {meta.can.edit ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => {
                  await setArchivedAction(ws, item.id, !item.archivedAt);
                  void refresh();
                  void qc.invalidateQueries({ queryKey: keys.items(item.projectId) });
                }}
              >
                <Archive />
                {item.archivedAt ? t("unarchive") : t("archive")}
              </DropdownMenuItem>
            </>
          ) : null}
          {meta.can.delete ? (
            <DropdownMenuItem
              destructive
              shortcut="mod+backspace"
              onSelect={() => {
                del.mutate([item.id]);
                onClose?.();
              }}
            >
              <Trash />
              {t("delete")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {onClose ? (
        <Tooltip content={t("close")} shortcut="esc">
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("close")}>
            <X />
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );

  const properties = (
    <Properties
      item={item}
      meta={meta}
      canEdit={canEdit}
      set={set}
      layout={mode === "page" ? "sidebar" : "inline"}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div
        className={cn("flex min-h-0 flex-1", mode === "page" ? "flex-col lg:flex-row" : "flex-col")}
      >
        <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
          <div
            className={cn(
              "flex flex-col gap-5 px-5 py-5",
              mode === "page" && "mx-auto w-full max-w-[880px] px-6 py-8 md:px-10",
            )}
          >
            {item.archivedAt ? <Banner tone="info" title={t("archived")} /> : null}
            {item.parent ? (
              <Link
                href={`/${ws}/i/${item.parent.identifier}` as never}
                className="-mb-3 inline-flex items-center gap-1.5 self-start text-small text-fg-muted hover:text-fg"
              >
                <GitBranch className="size-3.5" />
                <span className="tabular">{item.parent.identifier}</span>
                <span className="truncate">{item.parent.title}</span>
              </Link>
            ) : null}
            <TitleEditor
              key={item.id}
              value={item.title}
              disabled={!canEdit}
              onSave={(title) => set({ title })}
              large={mode === "page"}
            />
            {mode === "peek" ? properties : null}
            <DescriptionEditor
              ws={ws}
              item={item}
              meta={meta}
              disabled={!canEdit}
              onSave={(description) => set({ description })}
            />
            <SubItems ws={ws} item={item} meta={meta} canEdit={canEdit} onCreated={refresh} />
            <Relations ws={ws} item={item} canEdit={canEdit} onChanged={refresh} />
            <Links ws={ws} item={item} canEdit={canEdit} onChanged={refresh} />
            <Attachments ws={ws} item={item} canEdit={canEdit} onChanged={refresh} />
            <Timeline ws={ws} item={item} meta={meta} onChanged={refresh} />
          </div>
        </div>
        {mode === "page" ? (
          <aside className="w-full shrink-0 border-t border-border p-4 lg:w-[300px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
            {properties}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function TitleEditor({
  value,
  onSave,
  disabled,
  large,
}: {
  value: string;
  onSave: (v: string) => void;
  disabled: boolean;
  large: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [draft]);
  const commit = () => {
    const v = draft.trim();
    if (v && v !== value) onSave(v);
    else setDraft(value);
  };
  return (
    <textarea
      ref={ref}
      rows={1}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      aria-label="Title"
      className={cn(
        "w-full resize-none overflow-hidden rounded-[8px] bg-transparent font-semibold text-fg outline-none focus-visible:bg-surface-muted disabled:text-fg",
        large ? "text-display" : "text-title-lg",
      )}
    />
  );
}

function DescriptionEditor({
  ws,
  item,
  meta,
  disabled,
  onSave,
}: {
  ws: string;
  item: Detail;
  meta: ProjectMeta;
  disabled: boolean;
  onSave: (doc: unknown) => void;
}) {
  const t = useTranslations("items");
  const sources = useEditorSources(ws, meta);
  const pending = useRef<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current !== null) {
      onSave(pending.current);
      pending.current = null;
    }
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (disabled) {
    return item.description ? <RichTextView doc={item.description} /> : null;
  }
  return (
    <div onBlur={flush}>
      <RichTextEditor
        key={item.id}
        value={item.description}
        placeholder={t("descriptionPlaceholder")}
        sources={sources}
        onChange={(doc) => {
          pending.current = doc;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 1200);
        }}
      />
    </div>
  );
}

function Properties({
  item,
  meta,
  canEdit,
  set,
  layout,
}: {
  item: Detail;
  meta: ProjectMeta;
  canEdit: boolean;
  set: (p: Record<string, unknown>) => void;
  layout: "inline" | "sidebar";
}) {
  const t = useTranslations("items");
  const rows: Array<[string, React.ReactNode]> = [
    [
      t("prop.state"),
      <StatePicker
        key="s"
        variant="field"
        meta={meta}
        value={item.stateId}
        onChange={(stateId) => set({ stateId })}
        disabled={!canEdit}
      />,
    ],
    [
      t("prop.priority"),
      <PriorityPicker
        key="p"
        variant="field"
        value={item.priority}
        onChange={(priority) => set({ priority })}
        disabled={!canEdit}
      />,
    ],
    [
      t("prop.assignees"),
      <AssigneePicker
        key="a"
        variant="field"
        meta={meta}
        value={item.assigneeIds}
        onChange={(assigneeIds) => set({ assigneeIds })}
        disabled={!canEdit}
      />,
    ],
    [
      t("prop.labels"),
      <LabelPicker
        key="l"
        variant="field"
        meta={meta}
        value={item.labelIds}
        onChange={(labelIds) => set({ labelIds })}
        disabled={!canEdit}
      />,
    ],
    [
      t("prop.type"),
      <TypePicker
        key="t"
        variant="field"
        meta={meta}
        value={item.typeId}
        onChange={(typeId) => set({ typeId })}
        disabled={!canEdit}
      />,
    ],
    [
      t("prop.startDate"),
      <DatePicker
        key="sd"
        variant="field"
        label={t("setStart")}
        value={item.startDate}
        highlightOverdue={false}
        onChange={(startDate) => set({ startDate })}
        disabled={!canEdit}
      />,
    ],
    [
      t("prop.dueDate"),
      <DatePicker
        key="dd"
        variant="field"
        label={t("setDue")}
        value={item.dueDate}
        highlightOverdue={item.stateGroup !== "COMPLETED" && item.stateGroup !== "CANCELLED"}
        onChange={(dueDate) => set({ dueDate })}
        disabled={!canEdit}
      />,
    ],
  ];
  if (meta.project.estimateSystem !== "NONE") {
    rows.push([
      t("prop.estimate"),
      <EstimateField
        key="e"
        value={item.estimate}
        disabled={!canEdit}
        onSave={(estimate) => set({ estimate })}
      />,
    ]);
  }
  return (
    <dl
      className={cn(
        "grid items-center gap-x-3 gap-y-0.5",
        layout === "sidebar"
          ? "grid-cols-[96px_1fr]"
          : "grid-cols-[96px_1fr] rounded-card border border-border px-2 py-1.5 sm:grid-cols-[96px_1fr_96px_1fr]",
      )}
    >
      {rows.map(([label, control]) => (
        <div key={label} className="contents">
          <dt className="pl-2 text-small text-fg-muted">{label}</dt>
          <dd className="min-w-0">{control}</dd>
        </div>
      ))}
    </dl>
  );
}

function EstimateField({
  value,
  onSave,
  disabled,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value?.toString() ?? "");
  return (
    <Input
      type="number"
      min={0}
      className="h-8 w-24 border-transparent shadow-none hover:border-border-strong"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = draft === "" ? null : Number(draft);
        if (n !== value && (n === null || Number.isFinite(n))) onSave(n);
      }}
    />
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-8 items-center justify-between">
      <h3 className="text-body font-semibold text-fg">{children}</h3>
      {action}
    </div>
  );
}

function SubItems({
  ws,
  item,
  meta,
  canEdit,
  onCreated,
}: {
  ws: string;
  item: Detail;
  meta: ProjectMeta;
  canEdit: boolean;
  onCreated: () => void;
}) {
  const t = useTranslations("items");
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  if (item.children.length === 0 && !canEdit) return null;
  return (
    <section>
      <SectionTitle
        action={
          canEdit ? (
            <Button variant="ghost" size="xs" onClick={() => setAdding(true)}>
              <Plus />
              {t("addSubItem")}
            </Button>
          ) : null
        }
      >
        <span className="inline-flex items-center gap-2">
          {t("subItems")}
          {item.childCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-small font-normal text-fg-muted tabular">
              <ProgressRing value={item.childDoneCount} total={item.childCount} />
              {item.childDoneCount}/{item.childCount}
            </span>
          ) : null}
        </span>
      </SectionTitle>
      {item.children.length > 0 ? (
        <ul className="divide-y divide-border rounded-card border border-border">
          {item.children.map((c) => {
            const state = meta.states.find((s) => s.id === c.stateId);
            return (
              <li key={c.id}>
                <Link
                  href={`/${ws}/i/${c.identifier}` as never}
                  className="flex h-10 items-center gap-2 px-3 hover:bg-surface-hover"
                >
                  {state ? <StateIcon group={state.group} color={state.color} /> : null}
                  <span className="w-[72px] shrink-0 text-small text-fg-muted tabular">
                    {c.identifier}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-body",
                      (c.stateGroup === "COMPLETED" || c.stateGroup === "CANCELLED") &&
                        "text-fg-muted line-through",
                    )}
                  >
                    {c.title}
                  </span>
                  {c.assigneeIds[0]
                    ? (() => {
                        const u = meta.members.find((m) => m.id === c.assigneeIds[0]);
                        return u ? <Avatar user={u} size="xs" /> : null;
                      })()
                    : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {adding ? (
        <form
          className="mt-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const res = await createWorkItemAction(ws, {
              projectId: item.projectId,
              title: title.trim(),
              parentId: item.id,
            });
            if (res.ok) {
              setTitle("");
              onCreated();
              void qc.invalidateQueries({ queryKey: keys.items(item.projectId) });
            }
          }}
        >
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title && setAdding(false)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            placeholder={t("titlePlaceholder")}
          />
        </form>
      ) : null}
    </section>
  );
}

function Relations({
  ws,
  item,
  canEdit,
  onChanged,
}: {
  ws: string;
  item: Detail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("items");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"BLOCKS" | "BLOCKED_BY" | "RELATES_TO" | "DUPLICATE_OF">(
    "RELATES_TO",
  );
  const { data: hits = [] } = useItemSearch(ws, q, undefined, open);
  if (item.relations.length === 0 && !canEdit) return null;
  const kinds = ["BLOCKS", "BLOCKED_BY", "RELATES_TO", "DUPLICATE_OF"] as const;
  return (
    <section>
      <SectionTitle
        action={
          canEdit ? (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="xs">
                  <Plus />
                  {t("addRelation")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex flex-wrap gap-1 border-b border-border p-2">
                  {kinds.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        "h-7 rounded-chip px-2 text-small",
                        kind === k
                          ? "bg-sky-50 text-sky-800"
                          : "text-fg-secondary hover:bg-neutral-150",
                      )}
                    >
                      {t(`relation.${k.toLowerCase() as "blocks"}`)}
                    </button>
                  ))}
                </div>
                <Command shouldFilter={false}>
                  <CommandInput placeholder={t("searchItems")} value={q} onValueChange={setQ} />
                  <CommandList>
                    <CommandEmpty>{t("noValue")}</CommandEmpty>
                    {hits
                      .filter((h) => h.id !== item.id)
                      .map((h) => (
                        <CommandItem
                          key={h.id}
                          value={h.id}
                          onSelect={async () => {
                            const res = await addRelationAction(ws, {
                              id: item.id,
                              type: kind,
                              targetId: h.id,
                            });
                            if (res.ok) {
                              setOpen(false);
                              onChanged();
                            }
                          }}
                        >
                          <StateIcon group={h.stateGroup} />
                          <span className="text-small text-fg-muted tabular">{h.identifier}</span>
                          <span className="truncate">{h.title}</span>
                        </CommandItem>
                      ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : null
        }
      >
        {t("relations")}
      </SectionTitle>
      {item.relations.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {item.relations.map((r) => (
            <li
              key={r.id}
              className="group flex h-9 items-center gap-2 rounded-control px-2 hover:bg-surface-hover"
            >
              <span className="w-24 shrink-0 text-small text-fg-muted">
                {t(`relation.${r.kind}`)}
              </span>
              <StateIcon group={r.item.stateGroup} />
              <Link
                href={`/${ws}/i/${r.item.identifier}` as never}
                className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
              >
                <span className="shrink-0 text-small whitespace-nowrap text-fg-muted tabular">
                  {r.item.identifier}
                </span>
                <span className="truncate text-body">{r.item.title}</span>
              </Link>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={t("delete")}
                  onClick={async () => {
                    await removeRelationAction(ws, r.id);
                    onChanged();
                  }}
                  className="opacity-0 group-hover:opacity-100"
                >
                  <X className="size-4 text-icon" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Links({
  ws,
  item,
  canEdit,
  onChanged,
}: {
  ws: string;
  item: Detail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("items");
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  if (item.links.length === 0 && !canEdit) return null;
  return (
    <section>
      <SectionTitle
        action={
          canEdit ? (
            <Button variant="ghost" size="xs" onClick={() => setAdding(true)}>
              <Plus />
              {t("addLink")}
            </Button>
          ) : null
        }
      >
        {t("links")}
      </SectionTitle>
      {item.links.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {item.links.map((l) => (
            <li
              key={l.id}
              className="group inline-flex h-8 max-w-full items-center gap-1.5 rounded-chip border border-border px-2.5 text-small"
            >
              <ExternalLink className="size-3.5 text-icon" />
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="truncate text-link hover:underline"
              >
                {l.title || new URL(l.url).host}
              </a>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={t("delete")}
                  onClick={async () => {
                    await removeLinkAction(ws, l.id);
                    onChanged();
                  }}
                  className="opacity-0 group-hover:opacity-100"
                >
                  <X className="size-3.5 text-icon" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {adding ? (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await addLinkAction(ws, {
              id: item.id,
              url: url.trim(),
              title: title.trim() || undefined,
            });
            if (res.ok) {
              setUrl("");
              setTitle("");
              setAdding(false);
              onChanged();
            } else toast.error(t("errors.generic"));
          }}
        >
          <Input
            autoFocus
            type="url"
            required
            placeholder={t("linkUrl")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Input
            placeholder={t("linkTitle")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" variant="primary">
            {t("save")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/* ───────────────────────── timeline ───────────────────────── */

function Timeline({
  ws,
  item,
  meta,
  onChanged,
}: {
  ws: string;
  item: Detail;
  meta: ProjectMeta;
  onChanged: () => void;
}) {
  const t = useTranslations("items");
  const entries = useMemo(() => {
    const all: Array<
      | { kind: "comment"; at: string; c: CommentView }
      | { kind: "activity"; at: string; a: ActivityView }
    > = [
      ...item.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, c })),
      ...item.activities
        .filter((a) => a.verb !== "commented")
        .map((a) => ({ kind: "activity" as const, at: a.createdAt, a })),
    ];
    return all.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  }, [item.comments, item.activities]);

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("activity")}</SectionTitle>
      <ol className="relative flex flex-col gap-3 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-border">
        {entries.map((e) =>
          e.kind === "comment" ? (
            <CommentEntry key={e.c.id} ws={ws} c={e.c} meta={meta} onChanged={onChanged} />
          ) : (
            <ActivityEntry key={e.a.id} a={e.a} meta={meta} />
          ),
        )}
      </ol>
      {meta.can.comment ? (
        <CommentComposer ws={ws} item={item} meta={meta} onPosted={onChanged} />
      ) : null}
    </section>
  );
}

function ActivityEntry({ a, meta }: { a: ActivityView; meta: ProjectMeta }) {
  const t = useTranslations("items");
  const relative = useRelativeTime();
  const nameOf = (ids: unknown) =>
    (Array.isArray(ids) ? ids : [])
      .map(
        (id) =>
          meta.members.find((m) => m.id === id)?.name ?? meta.labels.find((l) => l.id === id)?.name,
      )
      .filter(Boolean)
      .join(", ");
  const fmtDate = (v: unknown) => (typeof v === "string" ? format(parseISO(v), "d MMM yyyy") : "");
  let text: string;
  if (a.verb === "created") text = t("act.created");
  else if (a.verb !== "updated")
    text = t.has(`act.${a.verb}` as never) ? t(`act.${a.verb}` as "act.created") : a.verb;
  else {
    const m = a.meta;
    switch (a.field) {
      case "state":
        text = t("act.state", { from: String(m.fromName ?? ""), to: String(m.toName ?? "") });
        break;
      case "priority":
        text = t("act.priority", { to: t(`priority.${String(a.toValue) as "NONE"}`) });
        break;
      case "title":
        text = t("act.title", { to: String(a.toValue ?? "") });
        break;
      case "description":
        text = t("act.description");
        break;
      case "assignees": {
        const added = nameOf(m.added);
        const removed = nameOf(m.removed);
        text = [
          added && t("act.assigneesAdded", { names: added }),
          removed && t("act.assigneesRemoved", { names: removed }),
        ]
          .filter(Boolean)
          .join(" · ");
        break;
      }
      case "labels": {
        const added = nameOf(m.added);
        const removed = nameOf(m.removed);
        text = [
          added && t("act.labelsAdded", { names: added }),
          removed && t("act.labelsRemoved", { names: removed }),
        ]
          .filter(Boolean)
          .join(" · ");
        break;
      }
      case "dueDate":
        text = a.toValue ? t("act.dueDate", { to: fmtDate(a.toValue) }) : t("act.dueDateCleared");
        break;
      case "startDate":
        text = a.toValue
          ? t("act.startDate", { to: fmtDate(a.toValue) })
          : t("act.startDateCleared");
        break;
      case "estimate":
        text = t("act.estimate", { to: String(a.toValue ?? "—") });
        break;
      case "type":
        text = t("act.type", { to: String(m.toName ?? "—") });
        break;
      case "parent":
        text = t("act.parent");
        break;
      default:
        text = t("act.generic", { field: a.field ?? "" });
    }
  }
  const actor = meta.members.find((m) => m.id === a.actorId);
  const toState = a.field === "state" ? meta.states.find((s) => s.name === a.meta.toName) : null;
  return (
    <li className="relative flex items-center gap-2 pl-0 text-small text-fg-muted">
      <span className="relative z-[1] flex size-6 items-center justify-center rounded-full bg-surface">
        {toState ? (
          <StateIcon group={toState.group} color={toState.color} size={14} />
        ) : actor ? (
          <Avatar user={actor} size="xs" />
        ) : (
          <span className="size-1.5 rounded-full bg-neutral-400" />
        )}
      </span>
      <span className="min-w-0">
        <span className="font-medium text-fg-secondary">{a.actorName}</span> {text}
        <span className="tabular"> · {relative(a.createdAt)}</span>
      </span>
    </li>
  );
}

const REACTIONS = ["👍", "🎉", "❤️", "👀", "🚀", "✅"];

function CommentEntry({
  ws,
  c,
  meta,
  onChanged,
}: {
  ws: string;
  c: CommentView;
  meta: ProjectMeta;
  onChanged: () => void;
}) {
  const t = useTranslations("items");
  const relative = useRelativeTime();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(c.body);
  const sources = useEditorSources(ws, meta);
  const author = meta.members.find((m) => m.id === c.authorId);
  const mine = c.authorId === meta.me;
  return (
    <li className="relative flex gap-2">
      <span className="relative z-[1] mt-0.5 shrink-0">
        {author ? (
          <Avatar user={author} size="sm" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full bg-neutral-150 text-caption">
            ?
          </span>
        )}
      </span>
      <div className="group min-w-0 flex-1 rounded-card border border-border bg-surface px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-small">
          <span className="font-medium text-fg">{c.authorName}</span>
          <span className="text-fg-muted tabular">{relative(c.createdAt)}</span>
          {c.editedAt ? <span className="text-fg-muted">· {t("edited")}</span> : null}
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="React">
                  <SmilePlus />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="flex gap-0.5 p-1">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="flex size-8 items-center justify-center rounded-[8px] text-title hover:bg-neutral-150"
                    onClick={async () => {
                      await toggleReactionAction(ws, { commentId: c.id, emoji });
                      onChanged();
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            {mine || meta.can.manage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={t("edit")}>
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {mine ? (
                    <DropdownMenuItem onSelect={() => setEditing(true)}>
                      {t("edit")}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    destructive
                    onSelect={async () => {
                      await setCommentDeletedAction(ws, c.id, true);
                      onChanged();
                      toast(t("deleted", { count: 1 }), {
                        action: {
                          label: t("undo"),
                          onClick: async () => {
                            await setCommentDeletedAction(ws, c.id, false);
                            onChanged();
                          },
                        },
                      });
                    }}
                  >
                    <Trash />
                    {t("delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
        {editing ? (
          <div className="mt-1.5 flex flex-col gap-2">
            <RichTextEditor
              value={c.body}
              onChange={setDraft}
              sources={sources}
              autoFocus
              onSubmit={async () => {
                await editCommentAction(ws, { id: c.id, body: draft });
                setEditing(false);
                onChanged();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                {t("cancel")}
              </Button>
              <Button
                size="xs"
                variant="primary"
                onClick={async () => {
                  await editCommentAction(ws, { id: c.id, body: draft });
                  setEditing(false);
                  onChanged();
                }}
              >
                {t("save")}
              </Button>
            </div>
          </div>
        ) : (
          <RichTextView doc={c.body} className="mt-1" />
        )}
        {c.reactions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {c.reactions.map((r) => {
              const reacted = r.userIds.includes(meta.me);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={async () => {
                    await toggleReactionAction(ws, { commentId: c.id, emoji: r.emoji });
                    onChanged();
                  }}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-small tabular",
                    reacted
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : "border-border hover:bg-surface-hover",
                  )}
                  title={r.userIds
                    .map((id) => meta.members.find((m) => m.id === id)?.name)
                    .filter(Boolean)
                    .join(", ")}
                >
                  <span>{r.emoji}</span>
                  {r.userIds.length}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function CommentComposer({
  ws,
  item,
  meta,
  onPosted,
}: {
  ws: string;
  item: Detail;
  meta: ProjectMeta;
  onPosted: () => void;
}) {
  const t = useTranslations("items");
  const sources = useEditorSources(ws, meta);
  const [doc, setDoc] = useState<unknown>(null);
  const [key, setKey] = useState(0);
  const [pending, setPending] = useState(false);
  const me = meta.members.find((m) => m.id === meta.me);
  const submit = async () => {
    if (!doc || pending) return;
    setPending(true);
    const res = await createCommentAction(ws, { workItemId: item.id, body: doc });
    setPending(false);
    if (res.ok) {
      setDoc(null);
      setKey((k) => k + 1);
      onPosted();
    } else if (res.message !== "empty_comment") toast.error(t("errors.generic"));
  };
  return (
    <div className="flex gap-2">
      {me ? <Avatar user={me} size="sm" className="mt-2" /> : null}
      <div className="min-w-0 flex-1 rounded-card border border-border-strong bg-surface px-3 py-2 shadow-xs focus-within:border-focus focus-within:ring-[3px] focus-within:ring-sky-400/30">
        <RichTextEditor
          key={key}
          value={null}
          onChange={setDoc}
          onSubmit={submit}
          placeholder={t("commentPlaceholder")}
          sources={sources}
          minHeight="min-h-[44px]"
        />
        <div className="mt-1 flex justify-end">
          <Tooltip content={t("comment")} shortcut="mod+enter">
            <Button size="sm" variant="primary" onClick={submit} loading={pending}>
              {t("comment")}
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
