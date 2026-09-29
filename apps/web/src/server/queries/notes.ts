import "server-only";
import type { Prisma } from "@dopl/db";
import { addDays, todayIn } from "@dopl/shared/domain/dates";
import { noteTitle, pickReviewSet, REVIEW_DAILY_LIMIT } from "@dopl/shared/domain/notes";
import { canNote, type PolicyNote } from "@dopl/shared/policy";
import type { TagColor } from "@dopl/shared/palette";
import type { NotesQuery, TodoStatus } from "@dopl/shared/schemas/notes";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import type {
  NoteCard,
  NoteRef,
  NoteSearchHit,
  NotesSummary,
  ReviewData,
  TagRow,
  TodoRow,
} from "@/features/notes/types";
import { db } from "../db";
import { NotFoundError } from "../action-result";
import type { WorkspaceCtx } from "../session";
import { startOfDayIn } from "./filters";
import { accessibleProjectsWhere } from "./projects";

/* ───────────────────────── visibility ───────────────────────── */

/**
 * Prisma mirror of `canNote(…, "note.view")` for notes other people own:
 * shared with the team, or attached to a project (directly or through a
 * work item) the actor can browse. Guests never see other people's notes.
 */
export function sharedWithMeWhere(ctx: WorkspaceCtx): Prisma.NoteWhereInput {
  if (ctx.role === "GUEST") return { id: { in: [] } };
  const projects = accessibleProjectsWhere(ctx);
  return {
    ownerId: { not: ctx.actor.userId },
    deletedAt: null,
    archivedAt: null,
    OR: [
      { visibility: "WORKSPACE" },
      { project: projects },
      { workItem: { deletedAt: null, project: projects } },
    ],
  };
}

/** Every note the actor may open: their own (any state) plus live shared ones. */
export function visibleNotesWhere(ctx: WorkspaceCtx): Prisma.NoteWhereInput {
  return {
    workspaceId: ctx.workspace.id,
    OR: [{ ownerId: ctx.actor.userId }, sharedWithMeWhere(ctx)],
  };
}

/** Policy input for one note; resolves project access for attached notes. */
export async function policyNote(
  ctx: WorkspaceCtx,
  note: {
    ownerId: string;
    visibility: "PRIVATE" | "WORKSPACE";
    archivedAt: Date | null;
    deletedAt: Date | null;
    projectId: string | null;
    workItemProjectId: string | null;
  },
): Promise<PolicyNote> {
  const attached = [note.projectId, note.workItemProjectId].filter((x): x is string => !!x);
  const visible =
    attached.length > 0 && note.ownerId !== ctx.actor.userId
      ? (await db.project.count({
          where: { ...accessibleProjectsWhere(ctx), id: { in: attached } },
        })) > 0
      : false;
  return {
    ownerId: note.ownerId,
    visibility: note.visibility,
    archived: Boolean(note.archivedAt),
    deleted: Boolean(note.deletedAt),
    attachedProjectVisible: visible,
  };
}

/* ───────────────────────── cards ───────────────────────── */

const refSelect = {
  id: true,
  sequence: true,
  title: true,
  stateGroup: true,
  project: { select: { identifier: true } },
} satisfies Prisma.WorkItemSelect;

function cardSelect(ctx: WorkspaceCtx) {
  return {
    id: true,
    ownerId: true,
    owner: { select: { id: true, name: true, image: true } },
    content: true,
    contentText: true,
    color: true,
    visibility: true,
    project: { select: { id: true, identifier: true, name: true, color: true } },
    workItem: {
      select: { id: true, sequence: true, title: true, project: { select: { identifier: true } } },
    },
    pinnedAt: true,
    archivedAt: true,
    deletedAt: true,
    openTodoCount: true,
    reviewCount: true,
    createdAt: true,
    updatedAt: true,
    tags: { select: { tag: { select: { path: true } } } },
    _count: { select: { todos: true } },
    references: {
      where: {
        kind: "CREATED_FROM",
        sourceType: "NOTE",
        workItem: { deletedAt: null, project: accessibleProjectsWhere(ctx) },
      },
      take: 1,
      orderBy: { createdAt: "desc" },
      select: { workItem: { select: refSelect } },
    },
  } satisfies Prisma.NoteSelect;
}
type CardRow = Prisma.NoteGetPayload<{ select: ReturnType<typeof cardSelect> }>;

type RefRow = Prisma.WorkItemGetPayload<{ select: typeof refSelect }>;
export function toRef(w: RefRow): NoteRef {
  return {
    id: w.id,
    identifier: formatIdentifier(w.project.identifier, w.sequence),
    title: w.title,
    stateGroup: w.stateGroup,
  };
}

function toCard(ctx: WorkspaceCtx, n: CardRow): NoteCard {
  const mine = n.ownerId === ctx.actor.userId;
  const policy: PolicyNote = {
    ownerId: n.ownerId,
    visibility: n.visibility,
    archived: Boolean(n.archivedAt),
    deleted: Boolean(n.deletedAt),
    attachedProjectVisible: false,
  };
  const converted = n.references[0]?.workItem;
  return {
    id: n.id,
    owner: n.owner,
    content: n.content,
    contentText: n.contentText,
    color: (n.color as TagColor | null) ?? null,
    visibility: n.visibility,
    project: n.project,
    workItem: n.workItem
      ? {
          id: n.workItem.id,
          identifier: formatIdentifier(n.workItem.project.identifier, n.workItem.sequence),
          title: n.workItem.title,
        }
      : null,
    pinnedAt: n.pinnedAt?.toISOString() ?? null,
    archivedAt: n.archivedAt?.toISOString() ?? null,
    deletedAt: n.deletedAt?.toISOString() ?? null,
    tags: n.tags.map((t) => t.tag.path).sort(),
    todoCount: n._count.todos,
    openTodoCount: n.openTodoCount,
    convertedTo: converted ? toRef(converted) : null,
    reviewCount: n.reviewCount,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    canEdit: mine && canNote(ctx.policyActor, policy, "note.edit"),
    canShare: mine && canNote(ctx.policyActor, policy, "note.share"),
  };
}

const tagWhere = (path: string): Prisma.NoteWhereInput => ({
  tags: {
    some: { tag: { OR: [{ path }, { path: { startsWith: `${path}/` } }] } },
  },
});

/** The notes grid: one filter, optionally narrowed by tag and search text. */
export async function listNotes(ctx: WorkspaceCtx, query: NotesQuery): Promise<NoteCard[]> {
  const me = ctx.actor.userId;
  const ws = ctx.workspace.id;
  let where: Prisma.NoteWhereInput;
  let orderBy: Prisma.NoteOrderByWithRelationInput[] = [{ createdAt: "desc" }];
  if (query.item) {
    // Notes attached to the item, or the note it was converted from.
    where = {
      AND: [
        visibleNotesWhere(ctx),
        { deletedAt: null, archivedAt: null },
        {
          OR: [
            { workItemId: query.item },
            { references: { some: { workItemId: query.item, kind: "CREATED_FROM" } } },
          ],
        },
      ],
    };
  } else {
    switch (query.filter) {
      case "all":
        where = { workspaceId: ws, ownerId: me, deletedAt: null, archivedAt: null };
        orderBy = [{ pinnedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
        break;
      case "pinned":
        where = {
          workspaceId: ws,
          ownerId: me,
          deletedAt: null,
          archivedAt: null,
          pinnedAt: { not: null },
        };
        orderBy = [{ pinnedAt: "desc" }];
        break;
      case "shared":
        where = { workspaceId: ws, ...sharedWithMeWhere(ctx) };
        orderBy = [{ updatedAt: "desc" }];
        break;
      case "archived":
        where = { workspaceId: ws, ownerId: me, deletedAt: null, archivedAt: { not: null } };
        orderBy = [{ archivedAt: "desc" }];
        break;
      case "trash":
        where = { workspaceId: ws, ownerId: me, deletedAt: { not: null } };
        orderBy = [{ deletedAt: "desc" }];
        break;
      case "recent":
        where = { workspaceId: ws, ownerId: me, deletedAt: null, archivedAt: null };
        orderBy = [{ updatedAt: "desc" }];
        break;
    }
  }
  const and: Prisma.NoteWhereInput[] = [where];
  if (query.tag) and.push(tagWhere(query.tag.toLowerCase()));
  // Trigram-indexed ILIKE (D-016).
  if (query.q) and.push({ contentText: { contains: query.q, mode: "insensitive" } });
  const rows = await db.note.findMany({
    where: { AND: and },
    orderBy,
    take: query.limit,
    select: cardSelect(ctx),
  });
  return rows.map((r) => toCard(ctx, r));
}

/** One note the actor may see (404 otherwise). */
export async function getNote(ctx: WorkspaceCtx, id: string): Promise<NoteCard> {
  const row = await db.note.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: {
      ownerId: true,
      visibility: true,
      archivedAt: true,
      deletedAt: true,
      projectId: true,
      workItem: { select: { projectId: true } },
    },
  });
  if (!row) throw new NotFoundError();
  const policy = await policyNote(ctx, {
    ...row,
    workItemProjectId: row.workItem?.projectId ?? null,
  });
  if (!canNote(ctx.policyActor, policy, "note.view")) throw new NotFoundError();
  const card = await db.note.findUniqueOrThrow({ where: { id }, select: cardSelect(ctx) });
  return toCard(ctx, card);
}

/** Cards for ids in the given order (services return canonical cards after writes). */
export async function cardsByIds(ctx: WorkspaceCtx, ids: string[]): Promise<NoteCard[]> {
  if (ids.length === 0) return [];
  const rows = await db.note.findMany({
    where: { id: { in: ids }, workspaceId: ctx.workspace.id },
    select: cardSelect(ctx),
  });
  const byId = new Map(rows.map((r) => [r.id, toCard(ctx, r)]));
  return ids.map((id) => byId.get(id)).filter((c): c is NoteCard => Boolean(c));
}

/* ───────────────────────── tags ───────────────────────── */

export async function listTags(ctx: WorkspaceCtx): Promise<TagRow[]> {
  const tags = await db.tag.findMany({
    where: { workspaceId: ctx.workspace.id, ownerId: ctx.actor.userId },
    orderBy: { path: "asc" },
    select: {
      id: true,
      path: true,
      name: true,
      parentId: true,
      _count: { select: { notes: { where: { note: { deletedAt: null, archivedAt: null } } } } },
    },
  });
  return tags.map((t) => ({
    id: t.id,
    path: t.path,
    name: t.name,
    parentId: t.parentId,
    count: t._count.notes,
  }));
}

/* ───────────────────────── to-dos ───────────────────────── */

export async function listTodos(
  ctx: WorkspaceCtx,
  status: TodoStatus,
  limit = 300,
): Promise<TodoRow[]> {
  const base: Prisma.NoteTodoWhereInput = {
    workspaceId: ctx.workspace.id,
    ownerId: ctx.actor.userId,
    note: { deletedAt: null, archivedAt: null },
  };
  const where: Prisma.NoteTodoWhereInput =
    status === "open"
      ? { ...base, checked: false, workItemId: null }
      : status === "done"
        ? { ...base, checked: true }
        : { ...base, workItemId: { not: null } };
  const orderBy: Prisma.NoteTodoOrderByWithRelationInput[] =
    status === "open"
      ? [
          { dueDate: { sort: "asc", nulls: "last" } },
          { note: { createdAt: "desc" } },
          { position: "asc" },
        ]
      : status === "done"
        ? [{ checkedAt: { sort: "desc", nulls: "last" } }]
        : [{ updatedAt: "desc" }];
  const rows = await db.noteTodo.findMany({
    where,
    orderBy,
    take: limit,
    select: {
      id: true,
      noteId: true,
      blockId: true,
      text: true,
      checked: true,
      dueDate: true,
      position: true,
      note: { select: { id: true, contentText: true, color: true } },
      workItem: { select: { ...refSelect, deletedAt: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    noteId: r.noteId,
    blockId: r.blockId,
    text: r.text,
    checked: r.checked,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    position: r.position,
    note: {
      id: r.note.id,
      title: noteTitle(r.note.contentText, 60),
      color: (r.note.color as TagColor | null) ?? null,
    },
    workItem: r.workItem && !r.workItem.deletedAt ? toRef(r.workItem) : null,
  }));
}

/* ───────────────────────── daily review ───────────────────────── */

function reviewDays(ctx: WorkspaceCtx, now: Date) {
  const tz = ctx.workspace.timezone;
  const today = todayIn(tz, now);
  return {
    today,
    startToday: startOfDayIn(today, tz),
    startTomorrow: startOfDayIn(addDays(today, 1), tz),
    startDayAfter: startOfDayIn(addDays(today, 2), tz),
  };
}

const reviewCandidatesWhere = (
  ctx: WorkspaceCtx,
  before: Date,
  handledSince: Date,
): Prisma.NoteWhereInput => ({
  workspaceId: ctx.workspace.id,
  ownerId: ctx.actor.userId,
  deletedAt: null,
  archivedAt: null,
  pinnedAt: null,
  nextReviewAt: { lt: before },
  OR: [{ lastReviewedAt: null }, { lastReviewedAt: { lt: handledSince } }],
});

async function reviewPick(ctx: WorkspaceCtx, now: Date) {
  const days = reviewDays(ctx, now);
  const doneToday = await db.note.count({
    where: {
      workspaceId: ctx.workspace.id,
      ownerId: ctx.actor.userId,
      lastReviewedAt: { gte: days.startToday },
    },
  });
  const candidates = await db.note.findMany({
    where: reviewCandidatesWhere(ctx, days.startTomorrow, days.startToday),
    orderBy: { nextReviewAt: "asc" },
    take: 500,
    select: { id: true, createdAt: true, reviewCount: true },
  });
  const picked = pickReviewSet(candidates, {
    now,
    seed: `${ctx.actor.userId}:${days.today}`,
    limit: Math.max(0, REVIEW_DAILY_LIMIT - doneToday),
  });
  return { days, doneToday, picked };
}

/**
 * The daily resurfacing set, computed on read (no `notes.review` job): up to
 * five of the owner's notes due for review, a stable weighted sample per day.
 */
export async function getReview(ctx: WorkspaceCtx, now = new Date()): Promise<ReviewData> {
  const { days, doneToday, picked } = await reviewPick(ctx, now);
  const [notes, dueTomorrow] = await Promise.all([
    cardsByIds(
      ctx,
      picked.map((p) => p.id),
    ),
    db.note.count({
      where: {
        workspaceId: ctx.workspace.id,
        ownerId: ctx.actor.userId,
        deletedAt: null,
        archivedAt: null,
        pinnedAt: null,
        nextReviewAt: { gte: days.startTomorrow, lt: days.startDayAfter },
      },
    }),
  ]);
  return { notes, doneToday, limit: REVIEW_DAILY_LIMIT, dueTomorrow };
}

/* ───────────────────────── summary & search ───────────────────────── */

export async function getNotesSummary(ctx: WorkspaceCtx): Promise<NotesSummary> {
  const ws = ctx.workspace.id;
  const me = ctx.actor.userId;
  const mine = { workspaceId: ws, ownerId: me };
  const [all, pinned, shared, archived, trash, openTodos, review] = await Promise.all([
    db.note.count({ where: { ...mine, deletedAt: null, archivedAt: null } }),
    db.note.count({
      where: { ...mine, deletedAt: null, archivedAt: null, pinnedAt: { not: null } },
    }),
    db.note.count({ where: { workspaceId: ws, ...sharedWithMeWhere(ctx) } }),
    db.note.count({ where: { ...mine, deletedAt: null, archivedAt: { not: null } } }),
    db.note.count({ where: { ...mine, deletedAt: { not: null } } }),
    db.noteTodo.count({
      where: {
        ...mine,
        checked: false,
        workItemId: null,
        note: { deletedAt: null, archivedAt: null },
      },
    }),
    reviewPick(ctx, new Date()),
  ]);
  return {
    counts: { all, pinned, shared, archived, trash },
    openTodos,
    reviewLeft: review.picked.length,
  };
}

/** ⌘K: the actor's notes and notes shared with them, by trigram-indexed text match. */
export async function searchNotes(ctx: WorkspaceCtx, q: string): Promise<NoteSearchHit[]> {
  if (!q) return [];
  const rows = await db.note.findMany({
    where: {
      AND: [
        visibleNotesWhere(ctx),
        { deletedAt: null, archivedAt: null },
        { contentText: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: {
      id: true,
      contentText: true,
      color: true,
      ownerId: true,
      owner: { select: { name: true } },
    },
  });
  return rows.map((r) => {
    const i = r.contentText.toLowerCase().indexOf(q.toLowerCase());
    const excerpt = i > 40 ? `…${r.contentText.slice(i - 30, i + 60)}` : r.contentText.slice(0, 90);
    return {
      id: r.id,
      title: noteTitle(r.contentText, 70),
      excerpt: excerpt.replace(/\s+/g, " "),
      color: (r.color as TagColor | null) ?? null,
      ownerName: r.owner.name,
      mine: r.ownerId === ctx.actor.userId,
    };
  });
}
