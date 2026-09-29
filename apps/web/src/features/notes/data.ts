"use client";

import {
  replaceEqualDeep,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  countOpenTodos,
  extractTags,
  extractTodos,
  isUnderTag,
  setTodoChecked,
} from "@dopl/shared/domain/notes";
import { uuidv7 } from "@dopl/shared/ids";
import type { TagColor } from "@dopl/shared/palette";
import { docToPlainText, type PMNode } from "@dopl/shared/rich-text";
import type { NoteFilter, NoteSharing, TodoStatus } from "@dopl/shared/schemas/notes";
import {
  convertNoteAction,
  convertTodoAction,
  createNoteAction,
  deleteTagAction,
  purgeNoteAction,
  renameTagAction,
  reviewNoteAction,
  setNoteArchivedAction,
  setNoteDeletedAction,
  setTodoDueAction,
  toggleTodoAction,
  updateNoteAction,
} from "@/server/actions/notes";
import type { ActionResult } from "@/server/action-result";
import type { PaletteData } from "@/server/queries/palette";
import type { NoteCard, NoteSearchHit, NotesSummary, ReviewData, TagRow, TodoRow } from "./types";

/* ─────────────── query keys (realtime invalidates ["notes", ws]) ─────────────── */

export interface ListParams {
  filter: NoteFilter;
  tag?: string | null;
  q?: string | null;
  item?: string | null;
  limit?: number;
}

export const noteKeys = {
  all: (ws: string) => ["notes", ws] as const,
  lists: (ws: string) => ["notes", ws, "list"] as const,
  list: (ws: string, p: ListParams) =>
    [
      "notes",
      ws,
      "list",
      p.filter,
      p.tag ?? null,
      p.q ?? null,
      p.item ?? null,
      p.limit ?? null,
    ] as const,
  one: (ws: string, id: string) => ["notes", ws, "one", id] as const,
  tags: (ws: string) => ["notes", ws, "tags"] as const,
  todos: (ws: string, status: TodoStatus) => ["notes", ws, "todos", status] as const,
  review: (ws: string) => ["notes", ws, "review"] as const,
  summary: (ws: string) => ["notes", ws, "summary"] as const,
  search: (ws: string, q: string) => ["notes", ws, "search", q] as const,
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export function listUrl(ws: string, p: ListParams): string {
  const s = new URLSearchParams({ filter: p.filter });
  if (p.tag) s.set("tag", p.tag);
  if (p.q) s.set("q", p.q);
  if (p.item) s.set("item", p.item);
  if (p.limit) s.set("limit", String(p.limit));
  return `/api/v1/${ws}/notes?${s.toString()}`;
}

/**
 * Structural sharing by note id instead of array index: when a card is added
 * or moves, every other card keeps its object, so its memoized render is
 * skipped (capturing a note re-renders one card, not the whole grid).
 */
function shareCardsById(old: unknown, next: unknown): unknown {
  if (!Array.isArray(old) || !Array.isArray(next)) return replaceEqualDeep(old, next);
  const byId = new Map((old as NoteCard[]).map((n) => [n.id, n]));
  const out = (next as NoteCard[]).map((n) => {
    const prev = byId.get(n.id);
    return prev ? replaceEqualDeep(prev, n) : n;
  });
  return out.length === old.length && out.every((n, i) => n === old[i]) ? old : out;
}

export function useNotes(ws: string, p: ListParams, initial?: NoteCard[]) {
  return useQuery({
    queryKey: noteKeys.list(ws, p),
    queryFn: () => getJson<NoteCard[]>(listUrl(ws, p)),
    initialData: initial,
    placeholderData: (prev) => prev,
    structuralSharing: shareCardsById,
  });
}

export function useNote(ws: string, id: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: noteKeys.one(ws, id ?? ""),
    queryFn: () => getJson<NoteCard>(`/api/v1/${ws}/notes/${id ?? ""}`),
    enabled: Boolean(id),
    // Open instantly from any cached list that already has the card.
    initialData: () => (id ? findCached(qc, ws, id) : undefined),
    initialDataUpdatedAt: 0,
  });
}

export function useTags(ws: string, initial?: TagRow[]) {
  return useQuery({
    queryKey: noteKeys.tags(ws),
    queryFn: () => getJson<TagRow[]>(`/api/v1/${ws}/notes/tags`),
    initialData: initial,
  });
}

export function useTodos(ws: string, status: TodoStatus, initial?: TodoRow[], limit?: number) {
  return useQuery({
    queryKey: [...noteKeys.todos(ws, status), limit ?? null],
    queryFn: () =>
      getJson<TodoRow[]>(
        `/api/v1/${ws}/notes/todos?status=${status}${limit ? `&limit=${limit}` : ""}`,
      ),
    initialData: initial,
    placeholderData: (prev) => prev,
  });
}

export function useReview(ws: string, initial?: ReviewData) {
  return useQuery({
    queryKey: noteKeys.review(ws),
    queryFn: () => getJson<ReviewData>(`/api/v1/${ws}/notes/review`),
    initialData: initial,
  });
}

export function useNotesSummary(ws: string, initial?: NotesSummary) {
  return useQuery({
    queryKey: noteKeys.summary(ws),
    queryFn: () => getJson<NotesSummary>(`/api/v1/${ws}/notes/summary`),
    initialData: initial,
  });
}

export function useNoteSearch(ws: string, q: string, enabled = true) {
  return useQuery({
    queryKey: noteKeys.search(ws, q),
    queryFn: () =>
      getJson<NoteSearchHit[]>(`/api/v1/${ws}/notes/search?q=${encodeURIComponent(q)}`),
    enabled: enabled && q.length > 0,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}

/** Projects the actor can see; shares the ⌘K palette's cache entry. */
export function useProjects(ws: string, enabled = true) {
  return useQuery({
    queryKey: ["palette", ws],
    queryFn: () => getJson<PaletteData>(`/api/v1/${ws}/palette`),
    enabled,
    staleTime: 30_000,
    select: (d) => d.projects,
  });
}

/* ─────────────── cache helpers (optimistic updates) ─────────────── */

type Snapshot = Array<[readonly unknown[], unknown]>;

function findCached(qc: QueryClient, ws: string, id: string): NoteCard | undefined {
  for (const [, data] of qc.getQueriesData<NoteCard[]>({ queryKey: noteKeys.lists(ws) }))
    if (Array.isArray(data)) {
      const hit = data.find((n) => n.id === id);
      if (hit) return hit;
    }
  const review = qc.getQueryData<ReviewData>(noteKeys.review(ws));
  return review?.notes.find((n) => n.id === id);
}

/** Does a card belong in a cached list with these params? (for inserts and moves) */
function belongs(card: NoteCard, key: readonly unknown[], me: string): boolean {
  const [, , , filter, tag, q, item] = key as [
    string,
    string,
    string,
    NoteFilter,
    string | null,
    string | null,
    string | null,
  ];
  if (item) return false;
  const mine = card.owner.id === me;
  const live = !card.deletedAt && !card.archivedAt;
  const ok =
    filter === "all" || filter === "recent"
      ? mine && live
      : filter === "pinned"
        ? mine && live && Boolean(card.pinnedAt)
        : filter === "archived"
          ? mine && !card.deletedAt && Boolean(card.archivedAt)
          : filter === "trash"
            ? mine && Boolean(card.deletedAt)
            : !mine && live;
  if (!ok) return false;
  if (tag && !card.tags.some((t) => isUnderTag(t, tag))) return false;
  if (q && !card.contentText.toLowerCase().includes(q.toLowerCase())) return false;
  return true;
}

/** Newest first, pinned on top in "all" (mirrors the server's order). */
function sortCards(cards: NoteCard[], filter: NoteFilter): NoteCard[] {
  const by = (a: string | null, b: string | null) =>
    a === b ? 0 : !a ? 1 : !b ? -1 : a < b ? 1 : -1;
  return [...cards].sort((a, b) =>
    filter === "all"
      ? by(a.pinnedAt, b.pinnedAt) || by(a.createdAt, b.createdAt)
      : filter === "pinned"
        ? by(a.pinnedAt, b.pinnedAt)
        : filter === "trash"
          ? by(a.deletedAt, b.deletedAt)
          : filter === "archived"
            ? by(a.archivedAt, b.archivedAt)
            : by(a.updatedAt, b.updatedAt),
  );
}

/**
 * Applies a new version of a card to every cached list, the single-note cache
 * and the review set: patched in place, moved in or out of lists by filter.
 * `null` removes it everywhere (purge).
 */
function applyCard(
  qc: QueryClient,
  ws: string,
  me: string,
  id: string,
  next: NoteCard | null,
): Snapshot {
  const snapshot: Snapshot = [];
  for (const [key, data] of qc.getQueriesData<NoteCard[]>({ queryKey: noteKeys.lists(ws) })) {
    if (!Array.isArray(data)) continue;
    const has = data.some((n) => n.id === id);
    const filter = key[3] as NoteFilter;
    const isItemList = Boolean(key[6]);
    let rows = data;
    if (!next) rows = data.filter((n) => n.id !== id);
    else if (isItemList) rows = has ? data.map((n) => (n.id === id ? next : n)) : data;
    else if (belongs(next, key, me))
      rows = sortCards(has ? data.map((n) => (n.id === id ? next : n)) : [next, ...data], filter);
    else if (has) rows = data.filter((n) => n.id !== id);
    if (rows !== data) {
      snapshot.push([key, data]);
      qc.setQueryData(key, rows);
    }
  }
  const oneKey = noteKeys.one(ws, id);
  const one = qc.getQueryData<NoteCard>(oneKey);
  if (one) {
    snapshot.push([oneKey, one]);
    qc.setQueryData(oneKey, next ?? undefined);
  }
  const review = qc.getQueryData<ReviewData>(noteKeys.review(ws));
  if (review?.notes.some((n) => n.id === id)) {
    snapshot.push([noteKeys.review(ws), review]);
    qc.setQueryData<ReviewData>(noteKeys.review(ws), {
      ...review,
      notes: review.notes.map((n) => (n.id === id && next ? next : n)),
    });
  }
  return snapshot;
}

function restore(qc: QueryClient, snapshot: Snapshot) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

function unwrap<T>(res: ActionResult<T>): T {
  if (!res.ok) throw Object.assign(new Error(res.message ?? res.error), { code: res.error });
  return res.data;
}

/** Derived fields a content change affects, computed like the server does. */
export function withContent(card: NoteCard, content: unknown): NoteCard {
  const doc = content as PMNode;
  const todos = extractTodos(doc);
  return {
    ...card,
    content,
    contentText: docToPlainText(doc),
    tags: extractTags(doc).sort(),
    todoCount: todos.length,
    openTodoCount: countOpenTodos(todos),
    updatedAt: new Date().toISOString(),
  };
}

function useNotesT() {
  return useTranslations("notes");
}

function errorMessage(t: ReturnType<typeof useNotesT>, err: unknown): string {
  const code = (err as { message?: string })?.message;
  switch (code) {
    case "forbidden":
      return t("errors.forbidden");
    case "too_large":
      return t("errors.tooLarge");
    case "already_converted":
      return t("errors.alreadyConverted");
    case "tag_into_itself":
      return t("errors.tagIntoItself");
    case "invalid_tag":
      return t("errors.invalidTag");
    case "invalid_input":
      return t("errors.invalidInput");
    default:
      return t("errors.generic");
  }
}

/** Refetch everything notes-related (after server-side changes we can't predict). */
export function invalidateNotes(qc: QueryClient, ws: string) {
  return qc.invalidateQueries({ queryKey: noteKeys.all(ws) });
}

/* ─────────────── mutations ─────────────── */

export interface NewNote {
  content: unknown;
  color?: TagColor | null;
  pinned?: boolean;
  sharing?: NoteSharing;
}

/** Quick capture: the card appears immediately (optimistic), then reconciles. */
export function useCreateNote(ws: string, me: { id: string; name: string; image: string | null }) {
  const qc = useQueryClient();
  const t = useNotesT();
  return useMutation({
    mutationFn: async (input: NewNote & { clientId: string }) =>
      unwrap(await createNoteAction(ws, input)),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: noteKeys.lists(ws) });
      const now = new Date().toISOString();
      const optimistic = withContent(
        {
          id: input.clientId,
          owner: me,
          content: input.content,
          contentText: "",
          color: input.color ?? null,
          visibility: input.sharing?.kind === "workspace" ? "WORKSPACE" : "PRIVATE",
          project: null,
          workItem: null,
          pinnedAt: input.pinned ? now : null,
          archivedAt: null,
          deletedAt: null,
          tags: [],
          todoCount: 0,
          openTodoCount: 0,
          convertedTo: null,
          reviewCount: 0,
          createdAt: now,
          updatedAt: now,
          canEdit: true,
          canShare: true,
        },
        input.content,
      );
      return { snapshot: applyCard(qc, ws, me.id, input.clientId, optimistic) };
    },
    onError: (err, _input, context) => {
      if (context) restore(qc, context.snapshot);
      toast.error(errorMessage(t, err));
    },
    onSuccess: (card) => {
      applyCard(qc, ws, me.id, card.id, card);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: noteKeys.tags(ws) });
      void qc.invalidateQueries({ queryKey: noteKeys.summary(ws) });
      void qc.invalidateQueries({ queryKey: ["notes", ws, "todos"] });
    },
  });
}

/** A fresh id for a note about to be captured. */
export const newNoteId = () => uuidv7();

export interface NotePatch {
  content?: unknown;
  color?: TagColor | null;
  pinned?: boolean;
  sharing?: NoteSharing;
}

/** Latest save per note: older responses must not overwrite newer optimistic content. */
const latestSave = new Map<string, number>();
let saveSeq = 0;

export function useUpdateNote(ws: string, me: string) {
  const qc = useQueryClient();
  const t = useNotesT();
  return useMutation({
    mutationFn: async (input: { card: NoteCard; patch: NotePatch }) =>
      unwrap(await updateNoteAction(ws, { id: input.card.id, ...input.patch })),
    onMutate: async ({ card, patch }) => {
      const seq = ++saveSeq;
      latestSave.set(card.id, seq);
      await qc.cancelQueries({ queryKey: noteKeys.all(ws) });
      let next = patch.content !== undefined ? withContent(card, patch.content) : { ...card };
      if (patch.color !== undefined) next = { ...next, color: patch.color };
      if (patch.pinned !== undefined)
        next = { ...next, pinnedAt: patch.pinned ? new Date().toISOString() : null };
      if (patch.sharing)
        next = {
          ...next,
          visibility: patch.sharing.kind === "workspace" ? "WORKSPACE" : "PRIVATE",
          ...(patch.sharing.kind === "private" || patch.sharing.kind === "workspace"
            ? { project: null, workItem: null }
            : {}),
        };
      return { snapshot: applyCard(qc, ws, me, card.id, next), seq };
    },
    onError: (err, _input, context) => {
      if (context) restore(qc, context.snapshot);
      toast.error(errorMessage(t, err));
    },
    onSuccess: (card, { patch }, context) => {
      // A newer save is on its way: its optimistic content stays until it lands.
      if (latestSave.get(card.id) === context.seq) applyCard(qc, ws, me, card.id, card);
      if (patch.content !== undefined) {
        void qc.invalidateQueries({ queryKey: noteKeys.tags(ws) });
        void qc.invalidateQueries({ queryKey: ["notes", ws, "todos"] });
      }
      void qc.invalidateQueries({ queryKey: noteKeys.summary(ws) });
    },
  });
}

/** Archive / trash / restore with an undo toast (D-020). */
export function useNoteLifecycle(ws: string, me: string) {
  const qc = useQueryClient();
  const t = useNotesT();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: noteKeys.summary(ws) });
    void qc.invalidateQueries({ queryKey: noteKeys.tags(ws) });
    void qc.invalidateQueries({ queryKey: ["notes", ws, "todos"] });
    void qc.invalidateQueries({ queryKey: noteKeys.review(ws) });
  };
  const run = async (
    card: NoteCard,
    change: "archive" | "unarchive" | "trash" | "restore",
    undoable: boolean,
  ) => {
    const now = new Date().toISOString();
    const next: NoteCard =
      change === "archive"
        ? { ...card, archivedAt: now }
        : change === "unarchive"
          ? { ...card, archivedAt: null }
          : change === "trash"
            ? { ...card, deletedAt: now }
            : { ...card, deletedAt: null };
    await qc.cancelQueries({ queryKey: noteKeys.all(ws) });
    const snapshot = applyCard(qc, ws, me, card.id, next);
    try {
      const res =
        change === "archive" || change === "unarchive"
          ? await setNoteArchivedAction(ws, card.id, change === "archive")
          : await setNoteDeletedAction(ws, card.id, change === "trash");
      applyCard(qc, ws, me, card.id, unwrap(res));
      settle();
      if (undoable) {
        const undo = {
          archive: "unarchive",
          unarchive: "archive",
          trash: "restore",
          restore: "trash",
        } as const;
        toast(t(`toast.${change}`), {
          duration: 5000,
          action: { label: t("undo"), onClick: () => void run(next, undo[change], false) },
        });
      }
    } catch (err) {
      restore(qc, snapshot);
      toast.error(errorMessage(t, err));
    }
  };
  return {
    archive: (card: NoteCard) => run(card, "archive", true),
    unarchive: (card: NoteCard) => run(card, "unarchive", true),
    trash: (card: NoteCard) => run(card, "trash", true),
    restore: (card: NoteCard) => run(card, "restore", true),
    purge: async (card: NoteCard) => {
      const snapshot = applyCard(qc, ws, me, card.id, null);
      try {
        unwrap(await purgeNoteAction(ws, card.id));
        settle();
        toast(t("toast.purged"));
      } catch (err) {
        restore(qc, snapshot);
        toast.error(errorMessage(t, err));
      }
    },
  };
}

/**
 * Toggles one checkbox (matched by blockId) everywhere at once: the note card
 * in every list, the note dialog and the to-do lists, then the server rewrites
 * the same node and the projection (D-022).
 */
export function useToggleTodo(ws: string, me: string) {
  const qc = useQueryClient();
  const t = useNotesT();
  return useMutation({
    mutationFn: async (input: { noteId: string; blockId: string; checked: boolean }) =>
      unwrap(await toggleTodoAction(ws, input)),
    onMutate: async ({ noteId, blockId, checked }) => {
      await qc.cancelQueries({ queryKey: noteKeys.all(ws) });
      const snapshot: Snapshot = [];
      const card =
        findCached(qc, ws, noteId) ?? qc.getQueryData<NoteCard>(noteKeys.one(ws, noteId));
      if (card) {
        const { doc } = setTodoChecked(card.content as PMNode, blockId, checked);
        const next = withContent(card, doc);
        // Converted lines don't count as open; keep the server's count for those.
        snapshot.push(
          ...applyCard(qc, ws, me, noteId, {
            ...next,
            openTodoCount: Math.max(0, card.openTodoCount + (checked ? -1 : 1)),
          }),
        );
      }
      for (const [key, data] of qc.getQueriesData<TodoRow[]>({
        queryKey: ["notes", ws, "todos"],
      })) {
        if (!Array.isArray(data) || !data.some((r) => r.noteId === noteId && r.blockId === blockId))
          continue;
        snapshot.push([key, data]);
        qc.setQueryData<TodoRow[]>(
          key,
          data.map((r) => (r.noteId === noteId && r.blockId === blockId ? { ...r, checked } : r)),
        );
      }
      return { snapshot };
    },
    onError: (err, _input, context) => {
      if (context) restore(qc, context.snapshot);
      toast.error(errorMessage(t, err));
    },
    onSuccess: (card) => {
      applyCard(qc, ws, me, card.id, card);
      void qc.invalidateQueries({ queryKey: noteKeys.summary(ws) });
    },
  });
}

export function useSetTodoDue(ws: string) {
  const qc = useQueryClient();
  const t = useNotesT();
  return useMutation({
    mutationFn: async (input: { todoId: string; dueDate: string | null }) =>
      unwrap(await setTodoDueAction(ws, input)),
    onMutate: async ({ todoId, dueDate }) => {
      await qc.cancelQueries({ queryKey: ["notes", ws, "todos"] });
      const snapshot: Snapshot = [];
      for (const [key, data] of qc.getQueriesData<TodoRow[]>({
        queryKey: ["notes", ws, "todos"],
      })) {
        if (!Array.isArray(data) || !data.some((r) => r.id === todoId)) continue;
        snapshot.push([key, data]);
        qc.setQueryData<TodoRow[]>(
          key,
          data.map((r) => (r.id === todoId ? { ...r, dueDate } : r)),
        );
      }
      return { snapshot };
    },
    onError: (err, _input, context) => {
      if (context) restore(qc, context.snapshot);
      toast.error(errorMessage(t, err));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["notes", ws, "todos"] }),
  });
}

/** Line → work item, or whole note → work item; the toast links to the new item. */
export function useConvert(ws: string, me: string) {
  const qc = useQueryClient();
  const router = useRouter();
  const t = useNotesT();
  return useMutation({
    mutationFn: async (
      input:
        | { kind: "todo"; noteId: string; blockId: string; projectId: string; title?: string }
        | { kind: "note"; noteId: string; projectId: string; title?: string; fromReview?: boolean },
    ) => {
      const { kind, ...rest } = input;
      return unwrap(
        kind === "todo" ? await convertTodoAction(ws, rest) : await convertNoteAction(ws, rest),
      );
    },
    onSuccess: (res) => {
      applyCard(qc, ws, me, res.note.id, res.note);
      void qc.invalidateQueries({ queryKey: ["notes", ws, "todos"] });
      void qc.invalidateQueries({ queryKey: noteKeys.summary(ws) });
      void qc.invalidateQueries({ queryKey: ["items"] });
      toast.success(t("toast.converted", { identifier: res.item.identifier }), {
        action: {
          label: t("open"),
          onClick: () => router.push(`/${ws}/i/${res.item.identifier}` as never),
        },
      });
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}

export function useReviewAction(ws: string) {
  const qc = useQueryClient();
  const t = useNotesT();
  return useMutation({
    mutationFn: async (
      input: { noteId: string } & (
        { action: "keep" } | { action: "archive" } | { action: "snooze"; days: number }
      ),
    ) => unwrap(await reviewNoteAction(ws, input)),
    onMutate: async ({ noteId }) => {
      await qc.cancelQueries({ queryKey: noteKeys.review(ws) });
      const prev = qc.getQueryData<ReviewData>(noteKeys.review(ws));
      if (prev)
        qc.setQueryData<ReviewData>(noteKeys.review(ws), {
          ...prev,
          notes: prev.notes.filter((n) => n.id !== noteId),
          doneToday: prev.doneToday + 1,
        });
      return { prev };
    },
    onError: (err, _input, context) => {
      if (context?.prev) qc.setQueryData(noteKeys.review(ws), context.prev);
      toast.error(errorMessage(t, err));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: noteKeys.summary(ws) });
      void qc.invalidateQueries({ queryKey: noteKeys.lists(ws) });
    },
  });
}

export function useTagActions(ws: string) {
  const qc = useQueryClient();
  const t = useNotesT();
  const done = () => invalidateNotes(qc, ws);
  return {
    rename: useMutation({
      mutationFn: async (input: { tagId: string; path: string }) =>
        unwrap(await renameTagAction(ws, input)),
      onSuccess: (res) => {
        toast(t("tags.renamed", { count: res.count, path: res.path ?? "" }));
        void done();
      },
      onError: (err) => toast.error(errorMessage(t, err)),
    }),
    remove: useMutation({
      mutationFn: async (input: { tagId: string }) => unwrap(await deleteTagAction(ws, input)),
      onSuccess: (res) => {
        toast(t("tags.deleted", { count: res.count }));
        void done();
      },
      onError: (err) => toast.error(errorMessage(t, err)),
    }),
  };
}
