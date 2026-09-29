"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog as D } from "radix-ui";
import { defaultFilter } from "cmdk";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleUserRound,
  Clock,
  Copy,
  ExternalLink,
  FolderKanban,
  House,
  Layers,
  Link2,
  Plus,
  Settings,
  SignalHigh,
  Tag as TagIcon,
  UserRound,
} from "lucide-react";
import { addDays, startOfWeek, todayIn } from "@dopl/shared/domain/dates";
import { priorities, type Priority } from "@dopl/shared/schemas/work-item";
import type { PaletteData } from "@/server/queries/palette";
import { updateWorkItemAction } from "@/server/actions/work-items";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar } from "@/components/ui/avatar";
import { TagDot } from "@/components/ui/tag";
import { Shortcut } from "@/components/ui/kbd";
import { StateIcon } from "@/components/icons/state-icon";
import { PriorityIcon } from "@/components/icons/priority-icon";
import { ProjectBadge } from "./project-badge";
import { useItemSearch, useProjectMeta, useWorkItemDetail } from "@/features/work-items/data";
import { getCreateHandler, usePaletteItem, type PaletteItem } from "@/features/palette/context";
import { keysFor } from "@/lib/shortcuts/registry";
import { OPEN_PALETTE_EVENT } from "./command-palette-events";
import { PaletteNotes } from "@/features/notes/palette-notes";

type ItemPageKind = "state" | "priority" | "assignee" | "labels" | "due";
type Page =
  | { kind: "root" }
  | { kind: "item"; item: PaletteItem }
  | { kind: ItemPageKind; item: PaletteItem };

/** Server search results are already matched; everything else uses cmdk's fuzzy score. */
function paletteFilter(value: string, search: string, keywords?: string[]) {
  return value.startsWith("item:") || value.startsWith("note:")
    ? 1
    : defaultFilter(value, search, keywords);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

/** ⌘K: navigation, search across items/projects/people, recents and item actions. */
export function CommandPalette() {
  const t = useTranslations("palette");
  const router = useRouter();
  const params = useParams<{ ws?: string }>();
  const ws = params.ws ?? "";
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<Page[]>([{ kind: "root" }]);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState("");
  const page = pages.at(-1) ?? { kind: "root" };
  const contextItem = usePaletteItem();

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

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 140);
    return () => clearTimeout(id);
  }, [query]);

  const { data } = useQuery({
    queryKey: ["palette", ws],
    queryFn: () => getJson<PaletteData>(`/api/v1/${ws}/palette`),
    enabled: open && Boolean(ws),
    staleTime: 30_000,
  });
  const search = useItemSearch(
    ws,
    debounced,
    undefined,
    open && page.kind === "root" && debounced.length > 0,
  );
  const hits = debounced ? (search.data ?? []) : [];
  // Results arrive after cmdk has picked a selection, so the best match is
  // selected until the user moves the cursor within this result set.
  const firstHit = hits[0]?.id ?? null;
  const [movedFor, setMovedFor] = useState<string | null>(null);
  const value = firstHit && movedFor !== firstHit ? `item:${firstHit}` : selected;

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setPages([{ kind: "root" }]);
      setQuery("");
    }
  };
  const close = () => onOpenChange(false);
  const go = (href: string) => {
    close();
    router.push(href as never);
  };
  const push = (p: Page) => {
    setPages((prev) => [...prev, p]);
    setQuery("");
  };

  const base = `/${ws}`;
  const itemHit = value.startsWith("item:")
    ? hits.find((h) => `item:${h.id}` === value)
    : undefined;

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-neutral-900/20 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content
          className="fixed top-[16vh] left-1/2 z-[60] w-[calc(100vw-32px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-panel border border-border bg-surface shadow-dialog outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
          data-testid="command-palette"
        >
          <D.Title className="sr-only">{t("title")}</D.Title>
          <Command
            loop
            filter={paletteFilter}
            value={value}
            onValueChange={(v) => {
              setSelected(v);
              setMovedFor(firstHit);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !query && pages.length > 1) {
                e.preventDefault();
                setPages((prev) => prev.slice(0, -1));
              } else if (e.key === "ArrowRight" && itemHit && page.kind === "root") {
                e.preventDefault();
                push({ kind: "item", item: itemHit });
              }
            }}
          >
            {page.kind !== "root" ? (
              <div className="flex items-center gap-1.5 border-b border-border px-3 pt-2.5 pb-2 text-small text-fg-muted">
                <span className="rounded-[6px] bg-neutral-100 px-1.5 py-0.5 font-medium text-fg-secondary tabular">
                  {page.item.identifier}
                </span>
                <span className="truncate">{page.item.title}</span>
                {page.kind !== "item" ? (
                  <>
                    <ArrowRight className="size-3" />
                    <span>{t(`page.${page.kind}`)}</span>
                  </>
                ) : null}
              </div>
            ) : null}
            <CommandInput
              placeholder={page.kind === "root" ? t("placeholder") : t("filterPlaceholder")}
              value={query}
              onValueChange={setQuery}
              autoFocus
            />
            <CommandList className="max-h-[400px]">
              <CommandEmpty>{t("empty")}</CommandEmpty>
              {page.kind === "root" ? (
                <RootPage
                  ws={ws}
                  base={base}
                  data={data}
                  hits={hits}
                  query={debounced}
                  contextItem={contextItem}
                  go={go}
                  push={push}
                  close={close}
                />
              ) : page.kind === "item" ? (
                <ItemActionEntries
                  ws={ws}
                  me={data?.me}
                  item={page.item}
                  push={push}
                  close={close}
                  go={go}
                />
              ) : (
                <ItemPropertyPage ws={ws} kind={page.kind} item={page.item} close={close} />
              )}
            </CommandList>
            <div className="flex h-9 items-center gap-3 border-t border-border px-3 text-caption text-fg-muted">
              <span className="inline-flex items-center gap-1">
                <Shortcut keys="enter" /> {t("hintOpen")}
              </span>
              {page.kind === "root" ? (
                <span className="inline-flex items-center gap-1">
                  <Shortcut keys="→" /> {t("hintActions")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Shortcut keys="backspace" /> {t("hintBack")}
                </span>
              )}
              <span className="ml-auto inline-flex items-center gap-1">
                <Shortcut keys="esc" /> {t("hintClose")}
              </span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/* ───────────────────────── root ───────────────────────── */

function RootPage({
  ws,
  base,
  data,
  hits,
  query,
  contextItem,
  go,
  push,
  close,
}: {
  ws: string;
  base: string;
  data: PaletteData | undefined;
  hits: Array<{ id: string; identifier: string; title: string; stateGroup: string }>;
  query: string;
  contextItem: PaletteItem | null;
  go: (href: string) => void;
  push: (p: Page) => void;
  close: () => void;
}) {
  const t = useTranslations("palette");
  const createHandler = getCreateHandler();
  return (
    <>
      {hits.length > 0 ? (
        <CommandGroup heading={t("items")}>
          {hits.map((h) => (
            <CommandItem
              key={h.id}
              value={`item:${h.id}`}
              onSelect={() => go(`${base}/i/${h.identifier}`)}
              data-testid="palette-item"
            >
              <StateIcon group={h.stateGroup as never} />
              <span className="w-20 shrink-0 text-small text-fg-muted tabular">{h.identifier}</span>
              <span className="truncate">{h.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      <PaletteNotes ws={ws} query={query} go={go} close={close} part="results" />

      {contextItem ? (
        <CommandGroup heading={`${contextItem.identifier} · ${contextItem.title}`}>
          <ItemActionEntries
            ws={ws}
            me={data?.me}
            item={contextItem}
            push={push}
            close={close}
            go={go}
          />
        </CommandGroup>
      ) : null}

      {!query && data?.recents.length ? (
        <CommandGroup heading={t("recent")}>
          {data.recents.map((r) => (
            <CommandItem
              key={`${r.type}:${r.id}`}
              value={`recent ${r.label} ${r.detail ?? ""}`}
              onSelect={() => go(r.href)}
            >
              {r.type === "item" ? (
                <Clock className="text-icon" />
              ) : r.type === "view" ? (
                <Layers className="text-icon" />
              ) : (
                <FolderKanban className="text-icon" />
              )}
              <span className="truncate">{r.label}</span>
              {r.detail ? (
                <span className="ml-auto shrink-0 text-small text-fg-muted tabular">
                  {r.detail}
                </span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      <CommandGroup heading={t("create")}>
        {createHandler ? (
          <CommandItem
            value="create new item"
            shortcut={keysFor("create")}
            onSelect={() => {
              close();
              createHandler();
            }}
          >
            <Plus className="text-icon" />
            {t("newItem")}
          </CommandItem>
        ) : null}
        <CommandItem value="create new project" onSelect={() => go(`${base}/projects?new=true`)}>
          <FolderKanban className="text-icon" />
          {t("newProject")}
        </CommandItem>
      </CommandGroup>

      <CommandGroup heading={t("navigation")}>
        <CommandItem
          value="go home"
          onSelect={() => go(`${base}/home`)}
          shortcut={keysFor("goHome")}
        >
          <House className="text-icon" />
          {t("goHome")}
        </CommandItem>
        <CommandItem
          value="go projects"
          onSelect={() => go(`${base}/projects`)}
          shortcut={keysFor("goProjects")}
        >
          <FolderKanban className="text-icon" />
          {t("goProjects")}
        </CommandItem>
        <CommandItem
          value="go views"
          onSelect={() => go(`${base}/views`)}
          shortcut={keysFor("goViews")}
        >
          <Layers className="text-icon" />
          {t("goViews")}
        </CommandItem>
        <CommandItem value="go all items" onSelect={() => go(`${base}/views/all`)}>
          <Layers className="text-icon" />
          {t("goAllItems")}
        </CommandItem>
        <CommandItem
          value="go settings"
          onSelect={() => go(`${base}/settings`)}
          shortcut={keysFor("goSettings")}
        >
          <Settings className="text-icon" />
          {t("goSettings")}
        </CommandItem>
      </CommandGroup>

      <PaletteNotes ws={ws} query={query} go={go} close={close} part="commands" />

      {data?.projects.length ? (
        <CommandGroup heading={t("projects")}>
          {data.projects.map((p) => (
            <CommandItem
              key={p.id}
              value={`project ${p.name} ${p.identifier}`}
              onSelect={() => go(`${base}/p/${p.identifier}/items`)}
            >
              <ProjectBadge name={p.name} color={p.color} size={16} />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-small text-fg-muted tabular">{p.identifier}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {query && data?.views.length ? (
        <CommandGroup heading={t("views")}>
          {data.views.map((v) => (
            <CommandItem
              key={v.id}
              value={`view ${v.name} ${v.projectName ?? ""}`}
              onSelect={() => go(v.href)}
            >
              <Layers className="text-icon" />
              <span className="truncate">{v.name}</span>
              {v.projectName ? (
                <span className="ml-auto text-small text-fg-muted">{v.projectName}</span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {query && data?.members.length ? (
        <CommandGroup heading={t("people")}>
          {data.members.map((m) => (
            <CommandItem
              key={m.id}
              value={`person ${m.name} ${m.email}`}
              onSelect={() =>
                go(
                  `${base}/views/all?f=${encodeURIComponent(
                    JSON.stringify({
                      op: "and",
                      items: [{ field: "assignee", operator: "in", value: [m.id] }],
                    }),
                  )}`,
                )
              }
            >
              <Avatar user={m} size="xs" />
              <span className="truncate">{t("assignedTo", { name: m.name })}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
    </>
  );
}

/* ───────────────────────── item actions ───────────────────────── */

function ItemActionEntries({
  ws,
  me: myId,
  item,
  push,
  close,
  go,
}: {
  ws: string;
  me: string | undefined;
  item: PaletteItem;
  push: (p: Page) => void;
  close: () => void;
  go: (href: string) => void;
}) {
  const t = useTranslations("palette");
  const apply = useApply(ws);
  const { data: detail } = useWorkItemDetail(ws, item.identifier);
  const assigned = Boolean(myId && detail?.assigneeIds.includes(myId));
  const copy = (text: string) => {
    close();
    void navigator.clipboard.writeText(text).then(() => toast.success(t("copied")));
  };
  const entry = (kind: ItemPageKind, icon: React.ReactNode, shortcut?: string) => (
    <CommandItem
      value={`${t(`page.${kind}`)} ${item.identifier}`}
      onSelect={() => push({ kind, item })}
      shortcut={shortcut}
    >
      {icon}
      {t(`action.${kind}`)}
    </CommandItem>
  );
  return (
    <>
      {entry("state", <StateIcon group={detail?.stateGroup ?? "BACKLOG"} />, keysFor("state"))}
      {entry("priority", <SignalHigh className="text-icon" />, keysFor("priority"))}
      {entry("assignee", <CircleUserRound className="text-icon" />, keysFor("assign"))}
      {myId && detail ? (
        <CommandItem
          value={`assign to me ${item.identifier}`}
          shortcut={keysFor("assignMe")}
          onSelect={() => {
            close();
            void apply(item, {
              assigneeIds: assigned
                ? detail.assigneeIds.filter((a) => a !== myId)
                : [...detail.assigneeIds, myId],
            });
          }}
        >
          <UserRound className="text-icon" />
          {assigned ? t("action.unassignMe") : t("action.assignMe")}
        </CommandItem>
      ) : null}
      {entry("labels", <TagIcon className="text-icon" />, keysFor("labels"))}
      {entry("due", <CalendarDays className="text-icon" />, keysFor("due"))}
      <CommandItem
        value={`open full page ${item.identifier}`}
        onSelect={() => go(`/${ws}/i/${item.identifier}`)}
        shortcut={keysFor("openFull")}
      >
        <ExternalLink className="text-icon" />
        {t("action.open")}
      </CommandItem>
      <CommandItem
        value={`copy link ${item.identifier}`}
        onSelect={() => copy(`${window.location.origin}/${ws}/i/${item.identifier}`)}
        shortcut={keysFor("copyLink")}
      >
        <Link2 className="text-icon" />
        {t("action.copyLink")}
      </CommandItem>
      <CommandItem
        value={`copy id ${item.identifier}`}
        onSelect={() => copy(item.identifier)}
        shortcut={keysFor("copyId")}
      >
        <Copy className="text-icon" />
        {t("action.copyId")}
      </CommandItem>
    </>
  );
}

/** Updates an item from the palette, then refreshes every list and detail cache. */
function useApply(ws: string) {
  const qc = useQueryClient();
  const t = useTranslations("palette");
  return async (item: PaletteItem, patch: Record<string, unknown>) => {
    const res = await updateWorkItemAction(ws, { id: item.id, ...patch });
    if (!res.ok) {
      toast.error(t("failed"));
      return false;
    }
    toast.success(t("updated", { identifier: item.identifier }));
    void qc.invalidateQueries({ queryKey: ["items"] });
    void qc.invalidateQueries({ queryKey: ["item"] });
    return true;
  };
}

function ItemPropertyPage({
  ws,
  kind,
  item,
  close,
}: {
  ws: string;
  kind: ItemPageKind;
  item: PaletteItem;
  close: () => void;
}) {
  const t = useTranslations("palette");
  const ti = useTranslations("items");
  const apply = useApply(ws);
  const { data: detail } = useWorkItemDetail(ws, item.identifier);
  const { data: meta } = useProjectMeta(ws, detail?.projectId ?? "");
  const set = (patch: Record<string, unknown>, keepOpen = false) => {
    if (!keepOpen) close();
    void apply(item, patch);
  };
  const check = (on: boolean) => (on ? <Check className="ml-auto text-sky-600" /> : null);
  // Priority needs nothing loaded; the other pages need the item's project.
  if (kind === "priority")
    return (
      <CommandGroup heading={t("page.priority")}>
        {priorities.map((p: Priority) => (
          <CommandItem key={p} value={ti(`priority.${p}`)} onSelect={() => set({ priority: p })}>
            <PriorityIcon priority={p} />
            {ti(`priority.${p}`)}
            {check(p === detail?.priority)}
          </CommandItem>
        ))}
      </CommandGroup>
    );
  if (!detail || !meta) return null;

  switch (kind) {
    case "state":
      return (
        <CommandGroup heading={t("page.state")}>
          {meta.states.map((s) => (
            <CommandItem key={s.id} value={s.name} onSelect={() => set({ stateId: s.id })}>
              <StateIcon group={s.group} color={s.color} />
              {s.name}
              {check(s.id === detail.stateId)}
            </CommandItem>
          ))}
        </CommandGroup>
      );
    case "assignee":
      return (
        <CommandGroup heading={t("page.assignee")}>
          {meta.members.map((m) => {
            const on = detail.assigneeIds.includes(m.id);
            return (
              <CommandItem
                key={m.id}
                value={`${m.name} ${m.email}`}
                onSelect={() =>
                  set(
                    {
                      assigneeIds: on
                        ? detail.assigneeIds.filter((a) => a !== m.id)
                        : [...detail.assigneeIds, m.id],
                    },
                    true,
                  )
                }
              >
                <Avatar user={m} size="xs" />
                {m.name}
                {check(on)}
              </CommandItem>
            );
          })}
        </CommandGroup>
      );
    case "labels":
      return (
        <CommandGroup heading={t("page.labels")}>
          {meta.labels.map((l) => {
            const on = detail.labelIds.includes(l.id);
            return (
              <CommandItem
                key={l.id}
                value={l.name}
                onSelect={() =>
                  set(
                    {
                      labelIds: on
                        ? detail.labelIds.filter((x) => x !== l.id)
                        : [...detail.labelIds, l.id],
                    },
                    true,
                  )
                }
              >
                <TagDot color={l.color} className="mx-1" />
                {l.name}
                {check(on)}
              </CommandItem>
            );
          })}
        </CommandGroup>
      );
    case "due": {
      const today = todayIn(meta.calendar.timeZone);
      const nextWeek = addDays(startOfWeek(today, meta.calendar.weekStartsOn), 7);
      const options: Array<{
        key: "today" | "tomorrow" | "nextWeek" | "inTwoWeeks" | "noDate";
        date: string | null;
      }> = [
        { key: "today", date: today },
        { key: "tomorrow", date: addDays(today, 1) },
        { key: "nextWeek", date: nextWeek },
        { key: "inTwoWeeks", date: addDays(today, 14) },
        { key: "noDate", date: null },
      ];
      return (
        <CommandGroup heading={t("page.due")}>
          {options.map((o) => (
            <CommandItem
              key={o.key}
              value={t(`due.${o.key}`)}
              onSelect={() => set({ dueDate: o.date })}
            >
              <CalendarDays className="text-icon" />
              {t(`due.${o.key}`)}
              {o.date ? (
                <span className="ml-auto text-small text-fg-muted tabular">{o.date}</span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      );
    }
  }
}
