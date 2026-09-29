import "server-only";
import type { Prisma, TransactionClient } from "@dopl/db";
import {
  addDaysTo,
  countOpenTodos,
  ensureBlockIds,
  expandTagPaths,
  extractTags,
  extractTodos,
  isUnderTag,
  markTodoConverted,
  normalizeTagPath,
  noteTitle,
  parentPath,
  reviewIntervalDays,
  rewriteTagInDoc,
  setTodoChecked,
  tagName,
} from "@dopl/shared/domain/notes";
import { canNote, ForbiddenError, type NoteAction } from "@dopl/shared/policy";
import { docToPlainText, isEmptyDoc, sanitizeDoc, type PMNode } from "@dopl/shared/rich-text";
import {
  ConvertNoteSchema,
  ConvertTodoSchema,
  CreateNoteSchema,
  DeleteTagSchema,
  NoteIdSchema,
  RenameTagSchema,
  ReviewActionSchema,
  SetTodoDueSchema,
  ToggleTodoSchema,
  UpdateNoteSchema,
  type NoteSharing,
} from "@dopl/shared/schemas/notes";
import { CreateWorkItemSchema } from "@dopl/shared/schemas/work-item";
import type { NoteCard } from "@/features/notes/types";
import { ConflictError, NotFoundError } from "../action-result";
import { db } from "../db";
import { withMutation, type Mutation } from "../mutation";
import { cardsByIds, policyNote } from "../queries/notes";
import { projectAccessById } from "../queries/projects";
import type { WorkspaceCtx } from "../session";
import { createOne, toDateOnly } from "./work-items";

/* ───────────────────────── helpers ───────────────────────── */

/** Stored content is at most this big (JSON characters). */
const MAX_CONTENT = 200_000;

const json = (doc: PMNode) => doc as unknown as Prisma.InputJsonValue;

/** Untrusted editor JSON → allowlisted nodes (D-019) with stable task ids (D-022). */
function prepareContent(raw: unknown): PMNode {
  const doc = ensureBlockIds(sanitizeDoc(raw));
  if (JSON.stringify(doc).length > MAX_CONTENT) throw new ConflictError("too_large");
  return doc;
}

interface Sharing {
  visibility: "PRIVATE" | "WORKSPACE";
  projectId: string | null;
  workItemId: string | null;
}
const PRIVATE: Sharing = { visibility: "PRIVATE", projectId: null, workItemId: null };

/** Checks the owner may attach the note where they asked; invisible targets look missing. */
async function resolveSharing(ctx: WorkspaceCtx, sharing: NoteSharing): Promise<Sharing> {
  switch (sharing.kind) {
    case "private":
      return PRIVATE;
    case "workspace":
      return { visibility: "WORKSPACE", projectId: null, workItemId: null };
    case "project": {
      const access = await projectAccessById(ctx, sharing.projectId);
      if (!access.can("project.view")) throw new ForbiddenError();
      return { visibility: "PRIVATE", projectId: access.project.id, workItemId: null };
    }
    case "workItem": {
      const item = await db.workItem.findFirst({
        where: { id: sharing.workItemId, workspaceId: ctx.workspace.id, deletedAt: null },
        select: { id: true, projectId: true },
      });
      if (!item) throw new NotFoundError();
      const access = await projectAccessById(ctx, item.projectId);
      if (!access.can("project.view")) throw new ForbiddenError();
      return { visibility: "PRIVATE", projectId: null, workItemId: item.id };
    }
  }
}

const sharingKind = (s: Sharing) =>
  s.workItemId ? "workItem" : s.projectId ? "project" : s.visibility.toLowerCase();

/** Realtime topics that can see a note: the owner, plus whoever it's shared with. */
function topicsFor(ctx: WorkspaceCtx, n: { ownerId: string } & Sharing): string[] {
  const topics = [`user:${n.ownerId}`];
  if (n.visibility === "WORKSPACE") topics.push(`workspace:${ctx.workspace.id}`);
  if (n.projectId) topics.push(`project:${n.projectId}`);
  if (n.workItemId) topics.push(`workItem:${n.workItemId}`);
  return topics;
}

/** Emits on the topics before and after the change, so un-sharing reaches old viewers too. */
function emitNote(
  m: Mutation,
  type: "note.created" | "note.updated" | "note.removed",
  id: string,
  ...states: Array<{ ownerId: string } & Sharing>
) {
  const topics = new Set(states.flatMap((s) => topicsFor(m.ctx, s)));
  for (const topic of topics) m.emit({ topic, type, payload: { id } });
}

const noteWriteSelect = {
  id: true,
  ownerId: true,
  content: true,
  color: true,
  visibility: true,
  projectId: true,
  workItemId: true,
  pinnedAt: true,
  archivedAt: true,
  deletedAt: true,
  reviewCount: true,
  workItem: { select: { projectId: true } },
} satisfies Prisma.NoteSelect;
type NoteForWrite = Prisma.NoteGetPayload<{ select: typeof noteWriteSelect }>;

/**
 * Loads a note the actor may change. Someone else's note they can see gives
 * 403; a note they can't see at all looks nonexistent (404).
 */
async function loadForWrite(
  tx: TransactionClient,
  ctx: WorkspaceCtx,
  id: string,
  action: NoteAction = "note.edit",
): Promise<NoteForWrite> {
  const note = await tx.note.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: noteWriteSelect,
  });
  if (!note) throw new NotFoundError();
  const policy = await policyNote(ctx, {
    ...note,
    workItemProjectId: note.workItem?.projectId ?? null,
  });
  if (!canNote(ctx.policyActor, policy, "note.view")) throw new NotFoundError();
  if (!canNote(ctx.policyActor, policy, action)) throw new ForbiddenError();
  return note;
}

async function canonical(ctx: WorkspaceCtx, id: string): Promise<NoteCard> {
  const [card] = await cardsByIds(ctx, [id]);
  if (!card) throw new NotFoundError();
  return card;
}

/* ───────────────────────── tags and to-dos (projections) ───────────────────────── */

/** Removes tags with no notes left in their subtree (parents stay while children are used). */
async function pruneTags(tx: TransactionClient, workspaceId: string, ownerId: string) {
  await tx.$executeRaw`
    DELETE FROM tags t
    WHERE t."ownerId" = ${ownerId}::uuid AND t."workspaceId" = ${workspaceId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM note_tags nt JOIN tags d ON d.id = nt."tagId"
        WHERE d."ownerId" = t."ownerId"
          AND (d.path = t.path OR starts_with(d.path, t.path || '/'))
      )`;
}

/**
 * Parses #tags from the content and links the note to exactly those tags,
 * creating parents implicitly (`infra` for `infra/proxmox`). Returns whether
 * the note's tag set changed.
 */
async function syncTags(
  tx: TransactionClient,
  workspaceId: string,
  note: { id: string; ownerId: string },
  doc: PMNode,
): Promise<boolean> {
  const paths = extractTags(doc);
  const byPath = new Map<string, string>();
  const all = expandTagPaths(paths);
  if (all.length) {
    const existing = await tx.tag.findMany({
      where: { ownerId: note.ownerId, path: { in: all } },
      select: { id: true, path: true },
    });
    for (const t of existing) byPath.set(t.path, t.id);
    for (const path of all) {
      if (byPath.has(path)) continue;
      const parent = parentPath(path);
      const created = await tx.tag.upsert({
        where: { ownerId_path: { ownerId: note.ownerId, path } },
        create: {
          workspaceId,
          ownerId: note.ownerId,
          path,
          name: tagName(path),
          parentId: parent ? (byPath.get(parent) ?? null) : null,
        },
        update: {},
        select: { id: true },
      });
      byPath.set(path, created.id);
    }
  }
  const want = new Set(paths.map((p) => byPath.get(p)).filter((x): x is string => Boolean(x)));
  const current = await tx.noteTag.findMany({
    where: { noteId: note.id },
    select: { tagId: true },
  });
  const have = new Set(current.map((c) => c.tagId));
  const add = [...want].filter((id) => !have.has(id));
  const remove = [...have].filter((id) => !want.has(id));
  if (remove.length)
    await tx.noteTag.deleteMany({ where: { noteId: note.id, tagId: { in: remove } } });
  if (add.length)
    await tx.noteTag.createMany({
      data: add.map((tagId) => ({ noteId: note.id, tagId })),
      skipDuplicates: true,
    });
  if (remove.length) await pruneTags(tx, workspaceId, note.ownerId);
  return add.length > 0 || remove.length > 0;
}

/**
 * Upserts the NoteTodo projection from the content (D-022), keyed by blockId.
 * Due dates and work-item links live only in the projection and survive edits.
 */
async function syncTodos(
  tx: TransactionClient,
  workspaceId: string,
  note: { id: string; ownerId: string },
  doc: PMNode,
): Promise<{ hasTodos: boolean; openTodoCount: number }> {
  const todos = extractTodos(doc);
  const existing = await tx.noteTodo.findMany({
    where: { noteId: note.id },
    select: {
      id: true,
      blockId: true,
      text: true,
      checked: true,
      position: true,
      workItemId: true,
    },
  });
  const byBlock = new Map(existing.map((e) => [e.blockId, e]));
  const keep = new Set(todos.map((t) => t.blockId));
  const gone = existing.filter((e) => !keep.has(e.blockId)).map((e) => e.id);
  if (gone.length) await tx.noteTodo.deleteMany({ where: { id: { in: gone } } });
  const now = new Date();
  const fresh = todos.filter((t) => !byBlock.has(t.blockId));
  if (fresh.length)
    await tx.noteTodo.createMany({
      data: fresh.map((t) => ({
        workspaceId,
        noteId: note.id,
        ownerId: note.ownerId,
        blockId: t.blockId,
        text: t.text,
        checked: t.checked,
        checkedAt: t.checked ? now : null,
        position: t.position,
      })),
    });
  for (const t of todos) {
    const e = byBlock.get(t.blockId);
    if (!e || (e.text === t.text && e.checked === t.checked && e.position === t.position)) continue;
    await tx.noteTodo.update({
      where: { id: e.id },
      data: {
        text: t.text,
        checked: t.checked,
        position: t.position,
        ...(e.checked !== t.checked ? { checkedAt: t.checked ? now : null } : {}),
      },
    });
  }
  return {
    hasTodos: todos.length > 0,
    openTodoCount: countOpenTodos(
      todos.map((t) => ({ checked: t.checked, workItemId: byBlock.get(t.blockId)?.workItemId })),
    ),
  };
}

async function recountOpenTodos(tx: TransactionClient, noteId: string) {
  const open = await tx.noteTodo.count({ where: { noteId, checked: false, workItemId: null } });
  const total = await tx.noteTodo.count({ where: { noteId } });
  await tx.note.update({
    where: { id: noteId },
    data: { openTodoCount: open, hasTodos: total > 0 },
  });
}

/* ───────────────────────── create / update ───────────────────────── */

export async function createNote(ctx: WorkspaceCtx, raw: unknown): Promise<NoteCard> {
  const input = CreateNoteSchema.parse(raw);
  const doc = prepareContent(input.content);
  if (isEmptyDoc(doc) && extractTodos(doc).length === 0) throw new ConflictError("empty_note");
  const policyShare = canNote(
    ctx.policyActor,
    {
      ownerId: ctx.actor.userId,
      visibility: "PRIVATE",
      archived: false,
      deleted: false,
      attachedProjectVisible: false,
    },
    "note.share",
  );
  if (input.sharing && input.sharing.kind !== "private" && !policyShare) throw new ForbiddenError();
  const sharing = input.sharing ? await resolveSharing(ctx, input.sharing) : PRIVATE;

  const id = await withMutation(ctx, async (m) => {
    const { tx } = m;
    if (input.clientId) {
      // A retried submit: the note already exists.
      const dup = await tx.note.findUnique({
        where: { id: input.clientId },
        select: { id: true, ownerId: true },
      });
      if (dup) {
        if (dup.ownerId !== ctx.actor.userId) throw new ConflictError("id_taken");
        return dup.id;
      }
    }
    const now = new Date();
    const note = await tx.note.create({
      data: {
        ...(input.clientId ? { id: input.clientId } : {}),
        workspaceId: ctx.workspace.id,
        ownerId: ctx.actor.userId,
        content: json(doc),
        contentText: docToPlainText(doc),
        color: input.color ?? null,
        pinnedAt: input.pinned ? now : null,
        ...sharing,
        nextReviewAt: addDaysTo(now, reviewIntervalDays(0)),
      },
      select: { id: true, ownerId: true },
    });
    await syncTags(tx, ctx.workspace.id, note, doc);
    const summary = await syncTodos(tx, ctx.workspace.id, note, doc);
    if (summary.hasTodos) await tx.note.update({ where: { id: note.id }, data: summary });
    m.activity({
      entityType: "NOTE",
      entityId: note.id,
      verb: "created",
      meta: { sharing: sharingKind(sharing) },
    });
    emitNote(m, "note.created", note.id, { ownerId: note.ownerId, ...sharing });
    return note.id;
  });
  return canonical(ctx, id);
}

export async function updateNote(ctx: WorkspaceCtx, raw: unknown): Promise<NoteCard> {
  const input = UpdateNoteSchema.parse(raw);
  const nextSharing = input.sharing ? await resolveSharing(ctx, input.sharing) : null;
  await withMutation(ctx, async (m) => {
    const { tx } = m;
    const note = await loadForWrite(tx, ctx, input.id, input.sharing ? "note.share" : "note.edit");
    if (note.deletedAt) throw new ConflictError("in_trash");
    const before: Sharing = {
      visibility: note.visibility,
      projectId: note.projectId,
      workItemId: note.workItemId,
    };
    const data: Prisma.NoteUncheckedUpdateInput = {};
    const act = (
      field: string,
      fromValue?: Prisma.InputJsonValue | null,
      toValue?: Prisma.InputJsonValue | null,
    ) =>
      m.activity({
        entityType: "NOTE",
        entityId: note.id,
        verb: "updated",
        field,
        fromValue,
        toValue,
      });

    if (input.content !== undefined) {
      const doc = prepareContent(input.content);
      data.content = json(doc);
      data.contentText = docToPlainText(doc);
      await syncTags(tx, ctx.workspace.id, note, doc);
      Object.assign(data, await syncTodos(tx, ctx.workspace.id, note, doc));
      act("content");
    }
    if (input.color !== undefined && input.color !== note.color) {
      data.color = input.color;
      act("color", note.color, input.color);
    }
    if (input.pinned !== undefined && input.pinned !== Boolean(note.pinnedAt)) {
      data.pinnedAt = input.pinned ? new Date() : null;
      act("pinned", !input.pinned, input.pinned);
    }
    if (
      nextSharing &&
      (nextSharing.visibility !== before.visibility ||
        nextSharing.projectId !== before.projectId ||
        nextSharing.workItemId !== before.workItemId)
    ) {
      Object.assign(data, nextSharing);
      act("sharing", sharingKind(before), sharingKind(nextSharing));
    }
    if (Object.keys(data).length === 0) return;
    await tx.note.update({ where: { id: note.id }, data });
    emitNote(
      m,
      "note.updated",
      note.id,
      { ownerId: note.ownerId, ...before },
      {
        ownerId: note.ownerId,
        ...(nextSharing ?? before),
      },
    );
  });
  return canonical(ctx, input.id);
}

/* ───────────────────────── lifecycle ───────────────────────── */

export async function setNoteArchived(ctx: WorkspaceCtx, rawId: unknown, archived: boolean) {
  const id = NoteIdSchema.parse(rawId);
  await withMutation(ctx, async (m) => {
    const note = await loadForWrite(m.tx, ctx, id);
    if (Boolean(note.archivedAt) === archived) return;
    await m.tx.note.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    m.activity({ entityType: "NOTE", entityId: id, verb: archived ? "archived" : "unarchived" });
    emitNote(m, "note.updated", id, note);
  });
  return canonical(ctx, id);
}

/** Trash (soft delete, D-020) or restore; the UI offers undo. */
export async function setNoteDeleted(ctx: WorkspaceCtx, rawId: unknown, deleted: boolean) {
  const id = NoteIdSchema.parse(rawId);
  await withMutation(ctx, async (m) => {
    const note = await loadForWrite(m.tx, ctx, id);
    if (Boolean(note.deletedAt) === deleted) return;
    await m.tx.note.update({ where: { id }, data: { deletedAt: deleted ? new Date() : null } });
    m.activity({ entityType: "NOTE", entityId: id, verb: deleted ? "deleted" : "restored" });
    emitNote(m, "note.updated", id, note);
  });
  return canonical(ctx, id);
}

/** Deletes a trashed note for good (the 30-day purge does the same later). */
export async function purgeNote(ctx: WorkspaceCtx, rawId: unknown) {
  const id = NoteIdSchema.parse(rawId);
  return withMutation(ctx, async (m) => {
    const note = await loadForWrite(m.tx, ctx, id);
    if (!note.deletedAt) throw new ConflictError("not_in_trash");
    await m.tx.note.delete({ where: { id } });
    await pruneTags(m.tx, ctx.workspace.id, note.ownerId);
    m.activity({ entityType: "NOTE", entityId: id, verb: "purged" });
    emitNote(m, "note.removed", id, note);
    return { id };
  });
}

/* ───────────────────────── to-dos ───────────────────────── */

/**
 * Toggles one checkbox from anywhere ("My to-dos", a card, Home): rewrites that
 * one task node in the note JSON (matched by blockId) and the projection in
 * the same transaction (D-022).
 */
export async function toggleTodo(ctx: WorkspaceCtx, raw: unknown): Promise<NoteCard> {
  const input = ToggleTodoSchema.parse(raw);
  await withMutation(ctx, async (m) => {
    const { tx } = m;
    const note = await loadForWrite(tx, ctx, input.noteId);
    if (note.deletedAt) throw new ConflictError("in_trash");
    const { doc, found } = setTodoChecked(
      note.content as unknown as PMNode,
      input.blockId,
      input.checked,
    );
    const todo = await tx.noteTodo.findUnique({
      where: { noteId_blockId: { noteId: note.id, blockId: input.blockId } },
      select: { id: true, checked: true },
    });
    if (!found || !todo) throw new NotFoundError();
    if (todo.checked === input.checked) return;
    await tx.note.update({ where: { id: note.id }, data: { content: json(doc) } });
    await tx.noteTodo.update({
      where: { id: todo.id },
      data: { checked: input.checked, checkedAt: input.checked ? new Date() : null },
    });
    await recountOpenTodos(tx, note.id);
    m.activity({
      entityType: "NOTE_TODO",
      entityId: todo.id,
      verb: input.checked ? "checked" : "unchecked",
    });
    emitNote(m, "note.updated", note.id, note);
  });
  return canonical(ctx, input.noteId);
}

export async function setTodoDue(ctx: WorkspaceCtx, raw: unknown) {
  const input = SetTodoDueSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const todo = await m.tx.noteTodo.findFirst({
      where: { id: input.todoId, workspaceId: ctx.workspace.id },
      select: { id: true, noteId: true, dueDate: true },
    });
    if (!todo) throw new NotFoundError();
    const note = await loadForWrite(m.tx, ctx, todo.noteId);
    await m.tx.noteTodo.update({
      where: { id: todo.id },
      data: { dueDate: toDateOnly(input.dueDate) ?? null },
    });
    m.activity({
      entityType: "NOTE_TODO",
      entityId: todo.id,
      verb: "updated",
      field: "dueDate",
      fromValue: todo.dueDate?.toISOString().slice(0, 10) ?? null,
      toValue: input.dueDate,
    });
    emitNote(m, "note.updated", note.id, note);
    return { id: todo.id, dueDate: input.dueDate };
  });
}

/**
 * A checkbox line becomes a work item: the item, a CREATED_FROM reference back
 * to the note and line, the projection link, and the struck-through line with
 * an `#INFRA-n` chip, all in one transaction.
 */
export async function convertTodo(ctx: WorkspaceCtx, raw: unknown) {
  const input = ConvertTodoSchema.parse(raw);
  const access = await projectAccessById(ctx, input.projectId);
  if (!access.can("workItem.create")) throw new ForbiddenError();
  const item = await withMutation(ctx, async (m) => {
    const { tx } = m;
    const note = await loadForWrite(tx, ctx, input.noteId, "note.convert");
    if (note.deletedAt) throw new ConflictError("in_trash");
    const todo = await tx.noteTodo.findUnique({
      where: { noteId_blockId: { noteId: note.id, blockId: input.blockId } },
      select: { id: true, text: true, workItem: { select: { deletedAt: true } } },
    });
    if (!todo) throw new NotFoundError();
    if (todo.workItem && !todo.workItem.deletedAt) throw new ConflictError("already_converted");
    const created = await createOne(
      m,
      access,
      CreateWorkItemSchema.parse({
        projectId: access.project.id,
        title: (input.title ?? todo.text).slice(0, 300),
      }),
    );
    await tx.workItemReference.create({
      data: {
        workspaceId: ctx.workspace.id,
        workItemId: created.id,
        kind: "CREATED_FROM",
        sourceType: "NOTE_TODO",
        noteId: note.id,
        noteTodoId: todo.id,
        createdById: ctx.actor.userId,
      },
    });
    const { doc, found } = markTodoConverted(note.content as unknown as PMNode, input.blockId, {
      id: created.id,
      identifier: created.identifier,
    });
    if (!found) throw new NotFoundError();
    const projected = extractTodos(doc).find((t) => t.blockId === input.blockId);
    await tx.note.update({
      where: { id: note.id },
      data: { content: json(doc), contentText: docToPlainText(doc) },
    });
    await tx.noteTodo.update({
      where: { id: todo.id },
      data: { workItemId: created.id, ...(projected ? { text: projected.text } : {}) },
    });
    await recountOpenTodos(tx, note.id);
    m.activity({
      entityType: "NOTE_TODO",
      entityId: todo.id,
      verb: "converted",
      toValue: created.identifier,
      meta: { workItemId: created.id, noteId: note.id },
    });
    emitNote(m, "note.updated", note.id, note);
    return { id: created.id, identifier: created.identifier, projectId: created.projectId };
  });
  return { item, note: await canonical(ctx, input.noteId) };
}

/** A whole note becomes a work item (title from its first line, the note as description). */
export async function convertNote(ctx: WorkspaceCtx, raw: unknown) {
  const input = ConvertNoteSchema.parse(raw);
  const access = await projectAccessById(ctx, input.projectId);
  if (!access.can("workItem.create")) throw new ForbiddenError();
  const item = await withMutation(ctx, async (m) => {
    const { tx } = m;
    const note = await loadForWrite(tx, ctx, input.noteId, "note.convert");
    if (note.deletedAt) throw new ConflictError("in_trash");
    const doc = note.content as unknown as PMNode;
    const title = input.title ?? noteTitle(docToPlainText(doc), 300);
    const created = await createOne(
      m,
      access,
      CreateWorkItemSchema.parse({ projectId: access.project.id, title, description: doc }),
    );
    await tx.workItemReference.create({
      data: {
        workspaceId: ctx.workspace.id,
        workItemId: created.id,
        kind: "CREATED_FROM",
        sourceType: "NOTE",
        noteId: note.id,
        createdById: ctx.actor.userId,
      },
    });
    if (input.fromReview) {
      const now = new Date();
      await tx.note.update({
        where: { id: note.id },
        data: {
          reviewCount: note.reviewCount + 1,
          lastReviewedAt: now,
          nextReviewAt: addDaysTo(now, reviewIntervalDays(note.reviewCount + 1)),
        },
      });
    }
    m.activity({
      entityType: "NOTE",
      entityId: note.id,
      verb: "converted",
      toValue: created.identifier,
      meta: { workItemId: created.id },
    });
    emitNote(m, "note.updated", note.id, note);
    return { id: created.id, identifier: created.identifier, projectId: created.projectId };
  });
  return { item, note: await canonical(ctx, input.noteId) };
}

/* ───────────────────────── daily review ───────────────────────── */

/**
 * Keep moves the next review out by the spaced interval (1 → 3 → 7 → 21 → 60
 * days); archive and snooze are the other ways out. Every action counts
 * towards today's set.
 */
export async function reviewNote(ctx: WorkspaceCtx, raw: unknown) {
  const input = ReviewActionSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const note = await loadForWrite(m.tx, ctx, input.noteId);
    const now = new Date();
    let data: Prisma.NoteUncheckedUpdateInput;
    switch (input.action) {
      case "keep":
        data = {
          reviewCount: note.reviewCount + 1,
          lastReviewedAt: now,
          nextReviewAt: addDaysTo(now, reviewIntervalDays(note.reviewCount + 1)),
        };
        break;
      case "archive":
        data = { archivedAt: now, lastReviewedAt: now };
        break;
      case "snooze":
        data = { lastReviewedAt: now, nextReviewAt: addDaysTo(now, input.days) };
        break;
    }
    const updated = await m.tx.note.update({
      where: { id: note.id },
      data,
      select: { nextReviewAt: true },
    });
    m.activity({ entityType: "NOTE", entityId: note.id, verb: "reviewed", field: input.action });
    emitNote(m, "note.updated", note.id, note);
    return { id: note.id, nextReviewAt: updated.nextReviewAt?.toISOString() ?? null };
  });
}

/* ───────────────────────── tag tree ───────────────────────── */

async function rewriteTag(ctx: WorkspaceCtx, tagId: string, to: string | null) {
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    const me = ctx.actor.userId;
    const tag = await tx.tag.findFirst({
      where: { id: tagId, ownerId: me, workspaceId: ctx.workspace.id },
      select: { id: true, path: true },
    });
    if (!tag) throw new NotFoundError();
    const from = tag.path;
    if (to === from) return { count: 0, path: to };
    if (to && isUnderTag(to, from)) throw new ConflictError("tag_into_itself");
    const notes = await tx.note.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        ownerId: me,
        tags: { some: { tag: { OR: [{ path: from }, { path: { startsWith: `${from}/` } }] } } },
      },
      select: noteWriteSelect,
    });
    for (const note of notes) {
      const doc = rewriteTagInDoc(note.content as unknown as PMNode, from, to);
      await tx.note.update({
        where: { id: note.id },
        data: { content: json(doc), contentText: docToPlainText(doc) },
      });
      await syncTags(tx, ctx.workspace.id, note, doc);
      m.activity({
        entityType: "NOTE",
        entityId: note.id,
        verb: to ? "tag_renamed" : "tag_removed",
        field: "tags",
        fromValue: from,
        toValue: to,
      });
      emitNote(m, "note.updated", note.id, note);
    }
    await pruneTags(tx, ctx.workspace.id, me);
    m.emit({ topic: `user:${me}`, type: "note.tags", payload: { id: tag.id } });
    return { count: notes.length, path: to };
  });
}

/** Renames a tag (and its children) in every note; onto an existing path, the two merge. */
export async function renameTag(ctx: WorkspaceCtx, raw: unknown) {
  const input = RenameTagSchema.parse(raw);
  const to = normalizeTagPath(input.path);
  if (!to) throw new ConflictError("invalid_tag");
  return rewriteTag(ctx, input.tagId, to);
}

/** Removes the tag's tokens from every note (the notes stay). */
export async function deleteTag(ctx: WorkspaceCtx, raw: unknown) {
  const input = DeleteTagSchema.parse(raw);
  return rewriteTag(ctx, input.tagId, null);
}
