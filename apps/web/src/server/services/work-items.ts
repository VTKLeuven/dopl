import "server-only";
import { Prisma, type TransactionClient } from "@dopl/db";
import { ForbiddenError } from "@dopl/shared/policy";
import {
  AddLinkSchema,
  AddRelationSchema,
  BulkUpdateSchema,
  CreateManyWorkItemsSchema,
  CreateWorkItemSchema,
  DONE_GROUPS,
  MoveWorkItemSchema,
  UpdateWorkItemSchema,
  type CreateWorkItemInput,
  type StateGroup,
  type UpdateWorkItemInput,
} from "@dopl/shared/schemas/work-item";
import { docToPlainText, extractMentions, sanitizeDoc, type PMNode } from "@dopl/shared/rich-text";
import { keyBefore, keyBetween, keysBetween } from "@dopl/shared/sort-keys";
import { ConflictError, NotFoundError } from "../action-result";
import { withMutation, type Mutation } from "../mutation";
import { projectAccessById, type ProjectAccess } from "../queries/projects";
import type { WorkspaceCtx } from "../session";

/* ───────────────────────── helpers ───────────────────────── */

export function toDateOnly(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(`${value}T00:00:00.000Z`);
}
export function fromDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

const isDone = (g: StateGroup) => DONE_GROUPS.includes(g);

async function nextSequence(tx: TransactionClient, projectId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ seq: number }[]>`
    UPDATE projects SET "nextSequence" = "nextSequence" + 1
    WHERE id = ${projectId}::uuid
    RETURNING "nextSequence" - 1 AS seq`;
  const seq = rows[0]?.seq;
  if (seq == null) throw new NotFoundError();
  return Number(seq);
}

async function resolveState(tx: TransactionClient, projectId: string, stateId: string | null | undefined) {
  if (stateId) {
    const s = await tx.workflowState.findFirst({ where: { id: stateId, projectId }, select: { id: true, group: true, name: true } });
    if (!s || s.group === "TRIAGE") throw new ConflictError("invalid_state");
    return s;
  }
  const fallback =
    (await tx.workflowState.findFirst({ where: { projectId, isDefault: true }, select: { id: true, group: true, name: true } })) ??
    (await tx.workflowState.findFirst({ where: { projectId, group: "BACKLOG" }, orderBy: { sortKey: "asc" }, select: { id: true, group: true, name: true } }));
  if (!fallback) throw new ConflictError("no_states");
  return fallback;
}

async function validAssignees(tx: TransactionClient, ctx: WorkspaceCtx, ids: string[]) {
  if (ids.length === 0) return [];
  const members = await tx.workspaceMember.findMany({
    where: { workspaceId: ctx.workspace.id, userId: { in: ids }, status: "ACTIVE", role: { not: "GUEST" } },
    select: { userId: true, user: { select: { name: true } } },
  });
  if (members.length !== new Set(ids).size) throw new ConflictError("invalid_assignee");
  return members.map((m) => ({ id: m.userId, name: m.user.name }));
}

async function validLabels(tx: TransactionClient, ctx: WorkspaceCtx, projectId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const labels = await tx.label.findMany({
    where: { id: { in: ids }, workspaceId: ctx.workspace.id, OR: [{ projectId }, { projectId: null }] },
    select: { id: true, name: true, color: true },
  });
  if (labels.length !== new Set(ids).size) throw new ConflictError("invalid_label");
  return labels;
}

async function validType(tx: TransactionClient, ctx: WorkspaceCtx, projectId: string, typeId: string | null | undefined) {
  if (typeId === null) return null;
  if (typeId) {
    const t = await tx.workItemType.findFirst({
      where: { id: typeId, workspaceId: ctx.workspace.id, OR: [{ projectId }, { projectId: null }] },
      select: { id: true, name: true },
    });
    if (!t) throw new ConflictError("invalid_type");
    return t;
  }
  return tx.workItemType.findFirst({
    where: { workspaceId: ctx.workspace.id, isDefault: true, OR: [{ projectId }, { projectId: null }] },
    select: { id: true, name: true },
  });
}

async function subscribe(tx: TransactionClient, ctx: WorkspaceCtx, workItemId: string, userId: string, reason: "CREATOR" | "ASSIGNEE" | "MENTIONED" | "COMMENTER" | "MANUAL") {
  await tx.workItemSubscriber.upsert({
    where: { workItemId_userId: { workItemId, userId } },
    create: { workItemId, userId, workspaceId: ctx.workspace.id, reason },
    update: {}, // never override a manual mute
  });
}

async function notify(
  tx: TransactionClient,
  ctx: WorkspaceCtx,
  args: { recipientIds: string[]; type: "MENTION" | "ASSIGNED" | "COMMENT" | "WORK_ITEM_UPDATED"; workItemId: string; projectId: string; data: Prisma.InputJsonValue },
) {
  const recipients = args.recipientIds.filter((id) => id !== ctx.actor.userId);
  if (recipients.length === 0) return;
  await tx.notification.createMany({
    data: recipients.map((recipientId) => ({
      workspaceId: ctx.workspace.id,
      recipientId,
      actorId: ctx.actor.userId,
      type: args.type,
      entityType: "WORK_ITEM",
      entityId: args.workItemId,
      workItemId: args.workItemId,
      projectId: args.projectId,
      groupKey: `workItem:${args.workItemId}:${args.type}`,
      data: args.data,
    })),
  });
}

function emitItem(m: Mutation, projectId: string, type: string, payload: Prisma.InputJsonValue) {
  m.emit({ topic: `project:${projectId}`, type, payload });
}

async function loadItemForWrite(tx: TransactionClient, ctx: WorkspaceCtx, id: string) {
  const item = await tx.workItem.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null },
    include: {
      state: { select: { id: true, name: true, group: true } },
      assignees: { select: { userId: true } },
      labels: { select: { labelId: true } },
    },
  });
  if (!item) throw new NotFoundError();
  const access = await projectAccessById(ctx, item.projectId);
  if (!access.can("workItem.edit")) throw new ForbiddenError();
  return { item, access };
}

/* ───────────────────────── create ───────────────────────── */

async function createOne(
  m: Mutation,
  access: ProjectAccess,
  input: ReturnType<typeof CreateWorkItemSchema.parse>,
  opts: { sortKey?: string } = {},
) {
  const { tx, ctx } = m;
  const projectId = access.project.id;
  const state = await resolveState(tx, projectId, input.stateId);
  // Sequential on purpose: one transaction = one connection.
  const assignees = await validAssignees(tx, ctx, input.assigneeIds);
  const labels = await validLabels(tx, ctx, projectId, input.labelIds);
  const type = await validType(tx, ctx, projectId, input.typeId);
  if (input.parentId) {
    const parent = await tx.workItem.findFirst({ where: { id: input.parentId, projectId, deletedAt: null }, select: { id: true } });
    if (!parent) throw new ConflictError("invalid_parent");
  }
  const first = opts.sortKey
    ? null
    : await tx.workItem.findFirst({ where: { projectId }, orderBy: { sortKey: "asc" }, select: { sortKey: true } });
  const sequence = await nextSequence(tx, projectId);
  const description = input.description ? sanitizeDoc(input.description) : null;
  const now = new Date();

  const item = await tx.workItem.create({
    data: {
      ...(input.clientId ? { id: input.clientId } : {}),
      workspaceId: ctx.workspace.id,
      projectId,
      sequence,
      title: input.title,
      description: description ? (description as unknown as Prisma.InputJsonValue) : undefined,
      descriptionText: docToPlainText(description),
      stateId: state.id,
      stateGroup: state.group,
      priority: input.priority,
      typeId: type?.id ?? null,
      parentId: input.parentId ?? null,
      sortKey: opts.sortKey ?? keyBefore(first?.sortKey ?? null),
      startDate: toDateOnly(input.startDate) ?? null,
      dueDate: toDateOnly(input.dueDate) ?? null,
      estimate: input.estimate ?? null,
      origin: ctx.actor.kind === "AGENT" ? "AGENT" : "APP",
      createdById: ctx.actor.userId,
      startedAt: state.group === "STARTED" ? now : null,
      completedAt: state.group === "COMPLETED" ? now : null,
      assignees: { createMany: { data: assignees.map((a) => ({ userId: a.id, workspaceId: ctx.workspace.id, assignedById: ctx.actor.userId })) } },
      labels: { createMany: { data: labels.map((l) => ({ labelId: l.id, workspaceId: ctx.workspace.id })) } },
    },
    select: { id: true, sequence: true, projectId: true, title: true },
  });

  if (input.parentId) {
    await tx.workItem.update({
      where: { id: input.parentId },
      data: { childCount: { increment: 1 }, ...(isDone(state.group) ? { childDoneCount: { increment: 1 } } : {}) },
    });
  }
  await subscribe(tx, ctx, item.id, ctx.actor.userId, "CREATOR");
  for (const a of assignees) await subscribe(tx, ctx, item.id, a.id, "ASSIGNEE");
  const mentioned = extractMentions(description);
  for (const u of mentioned) await subscribe(tx, ctx, item.id, u, "MENTIONED");

  const identifier = `${access.project.identifier}-${sequence}`;
  await notify(tx, ctx, { recipientIds: assignees.map((a) => a.id), type: "ASSIGNED", workItemId: item.id, projectId, data: { identifier, title: item.title } });
  await notify(tx, ctx, { recipientIds: mentioned, type: "MENTION", workItemId: item.id, projectId, data: { identifier, title: item.title } });

  m.activity({ entityType: "WORK_ITEM", entityId: item.id, workItemId: item.id, projectId, verb: "created", meta: { identifier, title: item.title } });
  emitItem(m, projectId, "workItem.created", { id: item.id });
  return { ...item, identifier };
}

export async function createWorkItem(ctx: WorkspaceCtx, raw: CreateWorkItemInput) {
  const input = CreateWorkItemSchema.parse(raw);
  const access = await projectAccessById(ctx, input.projectId);
  if (!access.can("workItem.create")) throw new ForbiddenError();
  return withMutation(ctx, (m) => createOne(m, access, input));
}

/** Paste N lines → N items in one transaction (consecutive numbers, one batch). */
export async function createWorkItems(ctx: WorkspaceCtx, raw: unknown) {
  const input = CreateManyWorkItemsSchema.parse(raw);
  const access = await projectAccessById(ctx, input.projectId);
  if (!access.can("workItem.create")) throw new ForbiddenError();
  const { titles, ...shared } = input;
  return withMutation(ctx, async (m) => {
    // Keys in line order above the current first item: line 1 lands on top,
    // and sequences ascend in the same order.
    const first = await m.tx.workItem.findFirst({ where: { projectId: input.projectId }, orderBy: { sortKey: "asc" }, select: { sortKey: true } });
    const keys = keysBetween(null, first?.sortKey ?? null, titles.length);
    const created = [];
    for (const [i, title] of titles.entries()) {
      created.push(await createOne(m, access, CreateWorkItemSchema.parse({ ...shared, title }), { sortKey: keys[i] }));
    }
    return created;
  });
}

/* ───────────────────────── update ───────────────────────── */

export async function updateWorkItem(ctx: WorkspaceCtx, raw: UpdateWorkItemInput) {
  const input = UpdateWorkItemSchema.parse(raw);
  return withMutation(ctx, (m) => applyUpdate(m, input));
}

async function applyUpdate(m: Mutation, input: ReturnType<typeof UpdateWorkItemSchema.parse>) {
  const { tx, ctx } = m;
  const { item, access } = await loadItemForWrite(tx, ctx, input.id);
  const projectId = item.projectId;
  const data: Prisma.WorkItemUncheckedUpdateInput = {};
  const changed: string[] = [];
  const act = (field: string, fromValue: Prisma.InputJsonValue | null, toValue: Prisma.InputJsonValue | null, meta?: Prisma.InputJsonValue) => {
    changed.push(field);
    m.activity({ entityType: "WORK_ITEM", entityId: item.id, workItemId: item.id, projectId, verb: "updated", field, fromValue, toValue, meta });
  };

  if (input.title !== undefined && input.title !== item.title) {
    data.title = input.title;
    act("title", item.title, input.title);
  }
  if (input.description !== undefined) {
    const doc = input.description ? sanitizeDoc(input.description) : null;
    data.description = doc ? (doc as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
    data.descriptionText = docToPlainText(doc);
    changed.push("description");
    const before = new Set(extractMentions(item.description as PMNode | null));
    const newMentions = extractMentions(doc).filter((u) => !before.has(u));
    for (const u of newMentions) await subscribe(tx, ctx, item.id, u, "MENTIONED");
    await notify(tx, ctx, { recipientIds: newMentions, type: "MENTION", workItemId: item.id, projectId, data: { title: item.title } });
    // One activity per editing session is noise; record only that it changed.
    m.activity({ entityType: "WORK_ITEM", entityId: item.id, workItemId: item.id, projectId, verb: "updated", field: "description" });
  }
  if (input.stateId !== undefined && input.stateId !== item.stateId) {
    const next = await resolveState(tx, projectId, input.stateId);
    data.stateId = next.id;
    data.stateGroup = next.group;
    if (next.group === "STARTED" && !item.startedAt) data.startedAt = new Date();
    data.completedAt = next.group === "COMPLETED" ? (item.completedAt ?? new Date()) : null;
    act("state", item.stateId, next.id, { fromName: item.state.name, toName: next.name, fromGroup: item.state.group, toGroup: next.group });
    if (item.parentId && isDone(item.stateGroup) !== isDone(next.group)) {
      await tx.workItem.update({ where: { id: item.parentId }, data: { childDoneCount: { increment: isDone(next.group) ? 1 : -1 } } });
    }
  }
  if (input.priority !== undefined && input.priority !== item.priority) {
    data.priority = input.priority;
    act("priority", item.priority, input.priority);
  }
  if (input.typeId !== undefined && input.typeId !== item.typeId) {
    const type = await validType(tx, ctx, projectId, input.typeId);
    data.typeId = type?.id ?? null;
    act("type", item.typeId, type?.id ?? null, { toName: type?.name ?? null });
  }
  for (const field of ["startDate", "dueDate"] as const) {
    const v = input[field];
    if (v !== undefined && v !== fromDateOnly(item[field])) {
      data[field] = toDateOnly(v) ?? null;
      act(field, fromDateOnly(item[field]), v);
    }
  }
  const start = input.startDate !== undefined ? input.startDate : fromDateOnly(item.startDate);
  const due = input.dueDate !== undefined ? input.dueDate : fromDateOnly(item.dueDate);
  if (start && due && start > due) throw new ConflictError("start_after_due");

  if (input.estimate !== undefined && input.estimate !== item.estimate) {
    data.estimate = input.estimate;
    act("estimate", item.estimate, input.estimate);
  }
  if (input.parentId !== undefined && input.parentId !== item.parentId) {
    if (input.parentId) {
      // Cycle check: walk up from the new parent.
      let cursor: string | null = input.parentId;
      for (let depth = 0; cursor && depth < 50; depth++) {
        if (cursor === item.id) throw new ConflictError("parent_cycle");
        const p: { parentId: string | null; projectId: string } | null = await tx.workItem.findUnique({ where: { id: cursor }, select: { parentId: true, projectId: true } });
        if (!p || p.projectId !== projectId) throw new ConflictError("invalid_parent");
        cursor = p.parentId;
      }
    }
    const done = isDone(item.stateGroup) ? 1 : 0;
    if (item.parentId) await tx.workItem.update({ where: { id: item.parentId }, data: { childCount: { decrement: 1 }, childDoneCount: { decrement: done } } });
    if (input.parentId) await tx.workItem.update({ where: { id: input.parentId }, data: { childCount: { increment: 1 }, childDoneCount: { increment: done } } });
    data.parentId = input.parentId;
    act("parent", item.parentId, input.parentId);
  }
  if (input.assigneeIds !== undefined) {
    const before = new Set(item.assignees.map((a) => a.userId));
    const after = new Set(input.assigneeIds);
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));
    if (added.length || removed.length) {
      const addedUsers = await validAssignees(tx, ctx, added);
      if (removed.length) await tx.workItemAssignee.deleteMany({ where: { workItemId: item.id, userId: { in: removed } } });
      if (addedUsers.length) {
        await tx.workItemAssignee.createMany({ data: addedUsers.map((u) => ({ workItemId: item.id, userId: u.id, workspaceId: ctx.workspace.id, assignedById: ctx.actor.userId })) });
        for (const u of addedUsers) await subscribe(tx, ctx, item.id, u.id, "ASSIGNEE");
        await notify(tx, ctx, { recipientIds: addedUsers.map((u) => u.id), type: "ASSIGNED", workItemId: item.id, projectId, data: { title: item.title } });
      }
      act("assignees", [...before], [...after], { added, removed });
    }
  }
  if (input.labelIds !== undefined) {
    const before = new Set(item.labels.map((l) => l.labelId));
    const after = new Set(input.labelIds);
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));
    if (added.length || removed.length) {
      const addedLabels = await validLabels(tx, ctx, projectId, added);
      if (removed.length) await tx.workItemLabel.deleteMany({ where: { workItemId: item.id, labelId: { in: removed } } });
      if (addedLabels.length) await tx.workItemLabel.createMany({ data: addedLabels.map((l) => ({ workItemId: item.id, labelId: l.id, workspaceId: ctx.workspace.id })) });
      act("labels", [...before], [...after], { added, removed });
    }
  }

  if (Object.keys(data).length > 0 || changed.length > 0) {
    await tx.workItem.update({ where: { id: item.id }, data: { ...data, updatedAt: new Date() } });
    emitItem(m, projectId, "workItem.updated", { id: item.id, fields: changed });
  }
  void access;
  return { id: item.id, changed };
}

export async function bulkUpdateWorkItems(ctx: WorkspaceCtx, raw: unknown) {
  const { ids, patch } = BulkUpdateSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const results = [];
    for (const id of ids) results.push(await applyUpdate(m, UpdateWorkItemSchema.parse({ id, ...patch })));
    return { updated: results.length };
  });
}

/* ───────────────────────── ordering ───────────────────────── */

export async function moveWorkItem(ctx: WorkspaceCtx, raw: unknown) {
  const input = MoveWorkItemSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { item } = await loadItemForWrite(m.tx, ctx, input.id);
    const neighbours = await m.tx.workItem.findMany({
      where: { id: { in: [input.beforeId, input.afterId].filter((x): x is string => Boolean(x)) }, projectId: item.projectId },
      select: { id: true, sortKey: true },
    });
    const before = neighbours.find((n) => n.id === input.beforeId)?.sortKey ?? null;
    const after = neighbours.find((n) => n.id === input.afterId)?.sortKey ?? null;
    let sortKey: string;
    try {
      sortKey = keyBetween(before, after);
    } catch {
      // Neighbours out of order (stale client view): fall back to placing after `before`.
      sortKey = keyBetween(before, null);
    }
    await m.tx.workItem.update({ where: { id: item.id }, data: { sortKey } });
    emitItem(m, item.projectId, "workItem.moved", { id: item.id, sortKey });
    return { id: item.id, sortKey };
  });
}

/* ───────────────────────── lifecycle ───────────────────────── */

export async function setArchived(ctx: WorkspaceCtx, id: string, archived: boolean) {
  return withMutation(ctx, async (m) => {
    const { item } = await loadItemForWrite(m.tx, ctx, id);
    await m.tx.workItem.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    m.activity({ entityType: "WORK_ITEM", entityId: id, workItemId: id, projectId: item.projectId, verb: archived ? "archived" : "unarchived" });
    emitItem(m, item.projectId, "workItem.updated", { id, fields: ["archivedAt"] });
    return { id };
  });
}

export async function setDeleted(ctx: WorkspaceCtx, id: string, deleted: boolean) {
  return withMutation(ctx, async (m) => {
    const item = await m.tx.workItem.findFirst({ where: { id, workspaceId: ctx.workspace.id }, select: { id: true, projectId: true, parentId: true, stateGroup: true, deletedAt: true } });
    if (!item) throw new NotFoundError();
    const access = await projectAccessById(ctx, item.projectId);
    if (!access.can("workItem.delete")) throw new ForbiddenError();
    if (Boolean(item.deletedAt) === deleted) return { id };
    await m.tx.workItem.update({ where: { id }, data: { deletedAt: deleted ? new Date() : null } });
    if (item.parentId) {
      const d = deleted ? -1 : 1;
      await m.tx.workItem.update({ where: { id: item.parentId }, data: { childCount: { increment: d }, ...(isDone(item.stateGroup) ? { childDoneCount: { increment: d } } : {}) } });
    }
    m.activity({ entityType: "WORK_ITEM", entityId: id, workItemId: id, projectId: item.projectId, verb: deleted ? "deleted" : "restored" });
    emitItem(m, item.projectId, deleted ? "workItem.deleted" : "workItem.created", { id });
    return { id };
  });
}

/* ───────────────────────── relations, links, subscription ───────────────────────── */

export async function addRelation(ctx: WorkspaceCtx, raw: unknown) {
  const input = AddRelationSchema.parse(raw);
  if (input.id === input.targetId) throw new ConflictError("self_relation");
  return withMutation(ctx, async (m) => {
    const { item } = await loadItemForWrite(m.tx, ctx, input.id);
    const target = await m.tx.workItem.findFirst({ where: { id: input.targetId, workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, projectId: true } });
    if (!target) throw new NotFoundError();
    await projectAccessById(ctx, target.projectId);
    // Canonical storage: BLOCKED_BY is stored as target BLOCKS source; RELATES_TO once, ordered.
    let sourceId = item.id;
    let targetId = target.id;
    let type: "BLOCKS" | "RELATES_TO" | "DUPLICATE_OF" = "BLOCKS";
    if (input.type === "BLOCKED_BY") [sourceId, targetId] = [target.id, item.id];
    else if (input.type === "RELATES_TO") {
      type = "RELATES_TO";
      if (sourceId > targetId) [sourceId, targetId] = [targetId, sourceId];
    } else if (input.type === "DUPLICATE_OF") type = "DUPLICATE_OF";
    await m.tx.workItemRelation.upsert({
      where: { sourceId_targetId_type: { sourceId, targetId, type } },
      create: { workspaceId: ctx.workspace.id, sourceId, targetId, type, createdById: ctx.actor.userId },
      update: {},
    });
    for (const id of [item.id, target.id]) {
      m.activity({ entityType: "WORK_ITEM", entityId: id, workItemId: id, projectId: id === item.id ? item.projectId : target.projectId, verb: "linked", field: "relation", toValue: { type: input.type, other: id === item.id ? target.id : item.id } });
    }
    emitItem(m, item.projectId, "workItem.updated", { id: item.id, fields: ["relations"] });
    return { ok: true };
  });
}

export async function removeRelation(ctx: WorkspaceCtx, relationId: string) {
  return withMutation(ctx, async (m) => {
    const rel = await m.tx.workItemRelation.findFirst({ where: { id: relationId, workspaceId: ctx.workspace.id } });
    if (!rel) throw new NotFoundError();
    const { item } = await loadItemForWrite(m.tx, ctx, rel.sourceId);
    await m.tx.workItemRelation.delete({ where: { id: rel.id } });
    m.activity({ entityType: "WORK_ITEM", entityId: rel.sourceId, workItemId: rel.sourceId, projectId: item.projectId, verb: "unlinked", field: "relation", fromValue: { type: rel.type, other: rel.targetId } });
    emitItem(m, item.projectId, "workItem.updated", { id: rel.sourceId, fields: ["relations"] });
    return { ok: true };
  });
}

export async function addLink(ctx: WorkspaceCtx, raw: unknown) {
  const input = AddLinkSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { item } = await loadItemForWrite(m.tx, ctx, input.id);
    const link = await m.tx.workItemLink.create({
      data: { workspaceId: ctx.workspace.id, workItemId: item.id, url: input.url, title: input.title ?? null, createdById: ctx.actor.userId },
      select: { id: true },
    });
    m.activity({ entityType: "WORK_ITEM", entityId: item.id, workItemId: item.id, projectId: item.projectId, verb: "linked", field: "link", toValue: { url: input.url } });
    emitItem(m, item.projectId, "workItem.updated", { id: item.id, fields: ["links"] });
    return link;
  });
}

export async function removeLink(ctx: WorkspaceCtx, linkId: string) {
  return withMutation(ctx, async (m) => {
    const link = await m.tx.workItemLink.findFirst({ where: { id: linkId, workspaceId: ctx.workspace.id } });
    if (!link) throw new NotFoundError();
    const { item } = await loadItemForWrite(m.tx, ctx, link.workItemId);
    await m.tx.workItemLink.delete({ where: { id: link.id } });
    m.activity({ entityType: "WORK_ITEM", entityId: item.id, workItemId: item.id, projectId: item.projectId, verb: "unlinked", field: "link", fromValue: { url: link.url } });
    emitItem(m, item.projectId, "workItem.updated", { id: item.id, fields: ["links"] });
    return { ok: true };
  });
}

export async function setSubscribed(ctx: WorkspaceCtx, id: string, subscribed: boolean) {
  return withMutation(ctx, async (m) => {
    const item = await m.tx.workItem.findFirst({ where: { id, workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, projectId: true } });
    if (!item) throw new NotFoundError();
    await projectAccessById(ctx, item.projectId);
    await m.tx.workItemSubscriber.upsert({
      where: { workItemId_userId: { workItemId: id, userId: ctx.actor.userId } },
      create: { workItemId: id, userId: ctx.actor.userId, workspaceId: ctx.workspace.id, reason: "MANUAL", muted: !subscribed },
      update: { muted: !subscribed },
    });
    return { subscribed };
  });
}
