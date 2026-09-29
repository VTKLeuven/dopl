import "server-only";
import type { Prisma } from "@dopl/db";
import {
  DONE_GROUPS,
  OPEN_GROUPS,
  formatIdentifier,
  parseIdentifier,
} from "@dopl/shared/schemas/work-item";
import type {
  ActivityView,
  CommentView,
  ProjectMeta,
  RelationView,
  WorkItemDetail,
  WorkItemRow,
} from "@/features/work-items/types";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import { fromDateOnly } from "../services/work-items";
import type { WorkspaceCtx } from "../session";
import { EMPTY_FILTER, parseFilter, type FilterGroup } from "@dopl/shared/schemas/filters";
import { compileFilter, type CompileContext } from "./filters";
import { projectAccessById, type ProjectAccess } from "./projects";

export const rowSelect = {
  id: true,
  projectId: true,
  sequence: true,
  title: true,
  stateId: true,
  stateGroup: true,
  priority: true,
  typeId: true,
  parentId: true,
  sortKey: true,
  startDate: true,
  dueDate: true,
  estimate: true,
  childCount: true,
  childDoneCount: true,
  commentCount: true,
  attachmentCount: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  assignees: { select: { userId: true } },
  labels: { select: { labelId: true } },
} satisfies Prisma.WorkItemSelect;

type RowRecord = Prisma.WorkItemGetPayload<{ select: typeof rowSelect }>;

export function toRow(r: RowRecord, projectIdentifier: string): WorkItemRow {
  return {
    id: r.id,
    projectId: r.projectId,
    sequence: r.sequence,
    identifier: formatIdentifier(projectIdentifier, r.sequence),
    title: r.title,
    stateId: r.stateId,
    stateGroup: r.stateGroup,
    priority: r.priority,
    typeId: r.typeId,
    parentId: r.parentId,
    sortKey: r.sortKey,
    startDate: fromDateOnly(r.startDate),
    dueDate: fromDateOnly(r.dueDate),
    estimate: r.estimate,
    assigneeIds: r.assignees.map((a) => a.userId),
    labelIds: r.labels.map((l) => l.labelId),
    childCount: r.childCount,
    childDoneCount: r.childDoneCount,
    commentCount: r.commentCount,
    attachmentCount: r.attachmentCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  };
}

export type CompletedMode = "hide" | "recent" | "show";

export function completedWhere(mode: CompletedMode): Prisma.WorkItemWhereInput {
  if (mode === "show") return { stateGroup: { in: [...OPEN_GROUPS, ...DONE_GROUPS] } };
  if (mode === "hide") return { stateGroup: { in: OPEN_GROUPS } };
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  return {
    OR: [
      { stateGroup: { in: OPEN_GROUPS } },
      { stateGroup: { in: DONE_GROUPS }, updatedAt: { gte: since } },
    ],
  };
}

export interface ItemsQuery {
  completed: CompletedMode;
  filters: FilterGroup;
}

export interface ItemsResult {
  rows: WorkItemRow[];
  hiddenDone: number;
  hiddenByState: Record<string, number>;
  /** More items matched than one response carries (see *_ITEMS_LIMIT). */
  truncated: boolean;
}

export function compileContext(ctx: WorkspaceCtx): CompileContext {
  return {
    userId: ctx.actor.userId,
    timeZone: ctx.workspace.timezone,
    weekStartsOn: ctx.workspace.weekStartsOn,
  };
}

/**
 * Items for a set of projects, filtered by the view's AST and "completed" mode.
 * Counts done items hidden by the mode (after the user's filter) for the
 * "Done hidden · N" chip and collapsed board columns (D-053).
 */
export async function listItems(
  ctx: WorkspaceCtx,
  projects: Array<{ id: string; identifier: string }>,
  query: ItemsQuery,
  opts: { limit?: number } = {},
): Promise<ItemsResult> {
  const identifiers = new Map(projects.map((p) => [p.id, p.identifier]));
  const limit = opts.limit ?? PROJECT_ITEMS_LIMIT;
  const base: Prisma.WorkItemWhereInput = {
    workspaceId: ctx.workspace.id,
    projectId: { in: [...identifiers.keys()] },
    deletedAt: null,
    archivedAt: null,
  };
  const user = compileFilter(query.filters, compileContext(ctx));
  // Two steps: Prisma applies the filter and returns ids only, then one SQL
  // query loads those rows with assignees and labels aggregated by Postgres.
  // Row mapping dominated the cost at 50k items (DECISIONS D-062).
  const [matches, doneByState] = await Promise.all([
    db.workItem.findMany({
      where: { AND: [base, user, completedWhere(query.completed)] },
      select: { id: true },
      // With a cap, keep the most recently touched items across projects.
      orderBy: identifiers.size > 1 ? { updatedAt: "desc" } : { sortKey: "asc" },
      take: limit + 1,
    }),
    query.completed === "show"
      ? Promise.resolve([])
      : db.workItem.groupBy({
          by: ["stateId"],
          where: { AND: [base, user, { stateGroup: { in: DONE_GROUPS } }] },
          _count: { _all: true },
        }),
  ]);
  const truncated = matches.length > limit;
  const ids = matches.slice(0, limit).map((m) => m.id);
  const rows = ids.length ? await loadRows(ids, identifiers) : [];

  const shownByState = new Map<string, number>();
  for (const r of rows)
    if (DONE_GROUPS.includes(r.stateGroup))
      shownByState.set(r.stateId, (shownByState.get(r.stateId) ?? 0) + 1);
  const hiddenByState: Record<string, number> = {};
  let hiddenDone = 0;
  for (const g of doneByState) {
    const hidden = Math.max(0, g._count._all - (shownByState.get(g.stateId) ?? 0));
    if (hidden > 0) hiddenByState[g.stateId] = hidden;
    hiddenDone += hidden;
  }
  return { rows, hiddenDone, hiddenByState, truncated };
}

/** Upper bounds on one list response; views past this ask for a narrower filter. */
export const PROJECT_ITEMS_LIMIT = 10_000;
export const WORKSPACE_ITEMS_LIMIT = 2_000;

interface RawRow {
  id: string;
  projectId: string;
  sequence: number | null;
  title: string;
  stateId: string;
  stateGroup: WorkItemRow["stateGroup"];
  priority: WorkItemRow["priority"];
  typeId: string | null;
  parentId: string | null;
  sortKey: string;
  startDate: string | null;
  dueDate: string | null;
  estimate: number | null;
  childCount: number;
  childDoneCount: number;
  commentCount: number;
  attachmentCount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  assigneeIds: string[] | null;
  labelIds: string[] | null;
}

async function loadRows(ids: string[], identifiers: Map<string, string>): Promise<WorkItemRow[]> {
  // Aggregating assignees and labels once per request beats a subquery per row.
  const raw = await db.$queryRaw<RawRow[]>`
    WITH a AS (
      SELECT "workItemId", array_agg("userId"::text) AS ids FROM work_item_assignees
      WHERE "workItemId" = ANY(${ids}::uuid[]) GROUP BY 1
    ), l AS (
      SELECT "workItemId", array_agg("labelId"::text) AS ids FROM work_item_labels
      WHERE "workItemId" = ANY(${ids}::uuid[]) GROUP BY 1
    )
    SELECT w.id, w."projectId", w.sequence, w.title, w."stateId", w."stateGroup"::text AS "stateGroup",
           w.priority::text AS priority, w."typeId", w."parentId", w."sortKey",
           to_char(w."startDate", 'YYYY-MM-DD') AS "startDate",
           to_char(w."dueDate", 'YYYY-MM-DD') AS "dueDate",
           w.estimate, w."childCount", w."childDoneCount", w."commentCount", w."attachmentCount",
           w."createdAt", w."updatedAt", w."completedAt",
           a.ids AS "assigneeIds", l.ids AS "labelIds"
    FROM work_items w
    LEFT JOIN a ON a."workItemId" = w.id
    LEFT JOIN l ON l."workItemId" = w.id
    WHERE w.id = ANY(${ids}::uuid[])
    ORDER BY w."sortKey"`;
  return raw.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    sequence: r.sequence,
    identifier: formatIdentifier(identifiers.get(r.projectId) ?? "", r.sequence),
    title: r.title,
    stateId: r.stateId,
    stateGroup: r.stateGroup,
    priority: r.priority,
    typeId: r.typeId,
    parentId: r.parentId,
    sortKey: r.sortKey,
    startDate: r.startDate,
    dueDate: r.dueDate,
    estimate: r.estimate,
    assigneeIds: r.assigneeIds ?? [],
    labelIds: r.labelIds ?? [],
    childCount: r.childCount,
    childDoneCount: r.childDoneCount,
    commentCount: r.commentCount,
    attachmentCount: r.attachmentCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));
}

/** `?completed=hide|recent|show&f=<filter JSON>`; anything invalid falls back to defaults. */
export function parseItemsQuery(params: URLSearchParams): ItemsQuery {
  const mode = params.get("completed");
  let filters: FilterGroup = EMPTY_FILTER;
  const raw = params.get("f");
  if (raw) {
    try {
      filters = parseFilter(JSON.parse(raw));
    } catch {
      filters = EMPTY_FILTER;
    }
  }
  return {
    completed: mode === "recent" || mode === "show" ? mode : "hide",
    filters,
  };
}

export function listProjectItems(ctx: WorkspaceCtx, access: ProjectAccess, query: ItemsQuery) {
  return listItems(ctx, [access.project], query);
}

export interface BlockingRelation {
  id: string;
  sourceId: string;
  targetId: string;
}

/** "A blocks B" pairs where both items live in the project and aren't deleted. */
export async function listBlockingRelations(access: ProjectAccess): Promise<BlockingRelation[]> {
  const live = { projectId: access.project.id, deletedAt: null, archivedAt: null };
  return db.workItemRelation.findMany({
    where: { type: "BLOCKS", source: live, target: live },
    select: { id: true, sourceId: true, targetId: true },
  });
}

export async function getProjectMeta(
  ctx: WorkspaceCtx,
  access: ProjectAccess,
): Promise<ProjectMeta> {
  const projectId = access.project.id;
  const memberWhere: Prisma.WorkspaceMemberWhereInput =
    access.project.visibility === "PRIVATE"
      ? {
          workspaceId: ctx.workspace.id,
          status: "ACTIVE",
          role: { not: "GUEST" },
          OR: [
            { role: { in: ["OWNER", "ADMIN"] } },
            { user: { projectMemberships: { some: { projectId } } } },
          ],
        }
      : { workspaceId: ctx.workspace.id, status: "ACTIVE", role: { not: "GUEST" } };
  const [states, labels, types, members] = await Promise.all([
    db.workflowState.findMany({
      where: { projectId, group: { not: "TRIAGE" } },
      orderBy: { sortKey: "asc" },
      select: { id: true, name: true, group: true, color: true, sortKey: true, isDefault: true },
    }),
    db.label.findMany({
      where: { workspaceId: ctx.workspace.id, OR: [{ projectId }, { projectId: null }] },
      orderBy: { sortKey: "asc" },
      select: { id: true, name: true, color: true, projectId: true },
    }),
    db.workItemType.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        archivedAt: null,
        OR: [{ projectId }, { projectId: null }],
      },
      orderBy: { sortKey: "asc" },
      select: { id: true, name: true, icon: true, color: true, isDefault: true },
    }),
    db.workspaceMember.findMany({
      where: memberWhere,
      select: { user: { select: { id: true, name: true, email: true, image: true, kind: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  return {
    project: {
      id: projectId,
      identifier: access.project.identifier,
      name: access.project.name,
      color: access.project.color,
      estimateSystem: access.project.estimateSystem,
    },
    states,
    labels,
    types,
    members: members.map((m) => m.user),
    can: {
      create: access.can("workItem.create"),
      edit: access.can("workItem.edit"),
      delete: access.can("workItem.delete"),
      manage: access.can("project.manage"),
      comment: access.can("comment.create"),
    },
    me: ctx.actor.userId,
    calendar: { timeZone: ctx.workspace.timezone, weekStartsOn: ctx.workspace.weekStartsOn },
  };
}

/** Resolve "INFRA-42" (current or previous identifier) → work item id + access. */
export async function resolveItemRef(
  ctx: WorkspaceCtx,
  ref: string,
): Promise<{ id: string; access: ProjectAccess }> {
  const parsed = parseIdentifier(ref);
  if (!parsed) throw new NotFoundError();
  const project = await db.project.findFirst({
    where: {
      workspaceId: ctx.workspace.id,
      deletedAt: null,
      OR: [{ identifier: parsed.identifier }, { previousIdentifiers: { has: parsed.identifier } }],
    },
    select: { id: true },
  });
  if (!project) throw new NotFoundError();
  const access = await projectAccessById(ctx, project.id);
  if (!access.can("project.view")) throw new NotFoundError();
  const item = await db.workItem.findFirst({
    where: { projectId: project.id, sequence: parsed.sequence, deletedAt: null },
    select: { id: true },
  });
  if (!item) throw new NotFoundError();
  return { id: item.id, access };
}

export async function getWorkItemDetail(ctx: WorkspaceCtx, ref: string): Promise<WorkItemDetail> {
  const { id, access } = await resolveItemRef(ctx, ref);
  const ident = access.project.identifier;
  const item = await db.workItem.findUniqueOrThrow({
    where: { id },
    select: {
      ...rowSelect,
      projectId: true,
      description: true,
      createdById: true,
      archivedAt: true,
      parent: { select: { id: true, sequence: true, title: true } },
      children: { where: { deletedAt: null }, select: rowSelect, orderBy: { sortKey: "asc" } },
      relationsOut: {
        select: {
          id: true,
          type: true,
          target: {
            select: {
              id: true,
              sequence: true,
              title: true,
              stateGroup: true,
              project: { select: { identifier: true } },
            },
          },
        },
      },
      relationsIn: {
        select: {
          id: true,
          type: true,
          source: {
            select: {
              id: true,
              sequence: true,
              title: true,
              stateGroup: true,
              project: { select: { identifier: true } },
            },
          },
        },
      },
      links: { select: { id: true, url: true, title: true }, orderBy: { createdAt: "asc" } },
      attachments: {
        where: { deletedAt: null, status: "READY" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          size: true,
          createdAt: true,
          uploadedBy: { select: { name: true } },
        },
      },
      comments: {
        where: { deletedAt: null, ...(access.role === "GUEST" ? { visibility: "PUBLIC" } : {}) },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          authorId: true,
          body: true,
          visibility: true,
          createdAt: true,
          editedAt: true,
          author: { select: { name: true } },
          authorContact: { select: { name: true, email: true } },
          reactions: { select: { emoji: true, userId: true } },
        },
      },
      activities: {
        take: access.role === "GUEST" ? 0 : 500,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          actorId: true,
          verb: true,
          field: true,
          fromValue: true,
          toValue: true,
          meta: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      },
      subscribers: { where: { userId: ctx.actor.userId }, select: { muted: true } },
    },
  });
  const relations: RelationView[] = [
    ...item.relationsOut.map((r) => ({
      id: r.id,
      kind: (r.type === "BLOCKS"
        ? "blocks"
        : r.type === "RELATES_TO"
          ? "relates_to"
          : "duplicate_of") as RelationView["kind"],
      item: {
        id: r.target.id,
        identifier: formatIdentifier(r.target.project.identifier, r.target.sequence),
        title: r.target.title,
        stateGroup: r.target.stateGroup,
      },
    })),
    ...item.relationsIn.map((r) => ({
      id: r.id,
      kind: (r.type === "BLOCKS"
        ? "blocked_by"
        : r.type === "RELATES_TO"
          ? "relates_to"
          : "duplicated_by") as RelationView["kind"],
      item: {
        id: r.source.id,
        identifier: formatIdentifier(r.source.project.identifier, r.source.sequence),
        title: r.source.title,
        stateGroup: r.source.stateGroup,
      },
    })),
  ];
  const comments: CommentView[] = item.comments.map((c) => {
    const grouped = new Map<string, string[]>();
    for (const r of c.reactions) grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.userId]);
    return {
      id: c.id,
      authorId: c.authorId,
      authorName: c.author?.name ?? c.authorContact?.name ?? c.authorContact?.email ?? "Unknown",
      body: c.body,
      visibility: c.visibility,
      createdAt: c.createdAt.toISOString(),
      editedAt: c.editedAt?.toISOString() ?? null,
      reactions: [...grouped.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
    };
  });
  const activities: ActivityView[] = item.activities.map((a) => ({
    id: a.id,
    actorId: a.actorId,
    actorName: a.actor?.name ?? "System",
    verb: a.verb,
    field: a.field,
    fromValue: a.fromValue,
    toValue: a.toValue,
    meta: (a.meta ?? {}) as Record<string, unknown>,
    createdAt: a.createdAt.toISOString(),
  }));
  return {
    ...toRow(item, ident),
    projectId: item.projectId,
    projectIdentifier: ident,
    description: item.description,
    createdById: item.createdById,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    parent: item.parent
      ? {
          id: item.parent.id,
          identifier: formatIdentifier(ident, item.parent.sequence),
          title: item.parent.title,
        }
      : null,
    children: item.children.map((c) => toRow(c, ident)),
    relations,
    links: item.links,
    attachments: item.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt.toISOString(),
      uploadedByName: a.uploadedBy?.name ?? null,
    })),
    comments,
    activities,
    subscribed: item.subscribers.length > 0 && !item.subscribers[0]?.muted,
  };
}
