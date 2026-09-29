import "server-only";
import type { Prisma } from "@dopl/db";
import { canView, canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import { FilterGroupSchema, normalizeFilter } from "@dopl/shared/schemas/filters";
import {
  CreateViewSchema,
  DisplayOptionsSchema,
  UpdateViewSchema,
  type CreateViewInput,
  type UpdateViewInput,
} from "@dopl/shared/schemas/view";
import { keyAfter } from "@dopl/shared/sort-keys";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import { withMutation } from "../mutation";
import { projectAccessById } from "../queries/projects";
import type { WorkspaceCtx } from "../session";

const json = (v: unknown) => v as Prisma.InputJsonValue;

function parseFilters(raw: unknown) {
  return json(normalizeFilter(FilterGroupSchema.parse(raw)));
}

/** Project views need project access; workspace views are for non-guests. */
async function assertScope(ctx: WorkspaceCtx, projectId: string | null) {
  if (projectId) {
    const access = await projectAccessById(ctx, projectId);
    if (!access.can("project.view") || ctx.role === "GUEST") throw new ForbiddenError();
  } else if (!canWorkspace(ctx.policyActor, "view.workspace.create")) {
    throw new ForbiddenError();
  }
}

export async function createView(ctx: WorkspaceCtx, raw: CreateViewInput) {
  const input = CreateViewSchema.parse(raw);
  await assertScope(ctx, input.projectId);
  const display = DisplayOptionsSchema.parse(input.displayOptions ?? {});
  return withMutation(ctx, async ({ tx, activity, emit }) => {
    const last = await tx.view.findFirst({
      where: { workspaceId: ctx.workspace.id, projectId: input.projectId },
      orderBy: { sortKey: "desc" },
      select: { sortKey: true },
    });
    const view = await tx.view.create({
      data: {
        workspaceId: ctx.workspace.id,
        projectId: input.projectId,
        ownerId: ctx.actor.userId,
        name: input.name,
        description: input.description ?? null,
        visibility: input.visibility,
        layout: display.layout,
        filters: parseFilters(input.filters),
        displayOptions: json(display),
        sortKey: keyAfter(last?.sortKey ?? null),
      },
      select: { id: true, name: true, projectId: true },
    });
    activity({
      entityType: "VIEW",
      entityId: view.id,
      projectId: view.projectId,
      verb: "created",
      meta: { name: view.name },
    });
    emit({
      topic: view.projectId ? `project:${view.projectId}` : `workspace:${ctx.workspace.id}`,
      type: "view.created",
      payload: { id: view.id },
    });
    return view;
  });
}

async function loadForWrite(ctx: WorkspaceCtx, id: string) {
  const view = await db.view.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      ownerId: true,
      visibility: true,
      isLocked: true,
      name: true,
    },
  });
  if (!view || !canView(ctx.policyActor, view, "view.see")) throw new NotFoundError();
  if (view.projectId) {
    const access = await projectAccessById(ctx, view.projectId);
    if (!access.can("project.view")) throw new NotFoundError();
  }
  return view;
}

export async function updateView(ctx: WorkspaceCtx, raw: UpdateViewInput) {
  const input = UpdateViewSchema.parse(raw);
  const view = await loadForWrite(ctx, input.id);
  const lockChange = input.isLocked !== undefined && input.isLocked !== view.isLocked;
  // Changing who can see it or locking it is the owner's (or an admin's) call.
  if (
    (lockChange || input.visibility !== undefined) &&
    !canView(ctx.policyActor, view, "view.lock")
  )
    throw new ForbiddenError();
  const contentChange =
    input.name !== undefined ||
    input.description !== undefined ||
    input.filters !== undefined ||
    input.displayOptions !== undefined;
  if (contentChange && !canView(ctx.policyActor, view, "view.edit")) throw new ForbiddenError();

  const data: Prisma.ViewUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.visibility !== undefined) data.visibility = input.visibility;
  if (input.isLocked !== undefined) data.isLocked = input.isLocked;
  if (input.filters !== undefined) data.filters = parseFilters(input.filters);
  if (input.displayOptions !== undefined) {
    const display = DisplayOptionsSchema.parse(input.displayOptions);
    data.displayOptions = json(display);
    data.layout = display.layout;
  }

  return withMutation(ctx, async ({ tx, activity, emit }) => {
    const updated = await tx.view.update({
      where: { id: view.id },
      data,
      select: { id: true, name: true, projectId: true },
    });
    activity({
      entityType: "VIEW",
      entityId: view.id,
      projectId: view.projectId,
      verb: "updated",
      meta: { fields: Object.keys(data) },
    });
    emit({
      topic: view.projectId ? `project:${view.projectId}` : `workspace:${ctx.workspace.id}`,
      type: "view.updated",
      payload: { id: view.id },
    });
    return updated;
  });
}

export async function deleteView(ctx: WorkspaceCtx, id: string) {
  const view = await loadForWrite(ctx, id);
  if (!canView(ctx.policyActor, view, "view.delete")) throw new ForbiddenError();
  return withMutation(ctx, async ({ tx, activity, emit }) => {
    await tx.view.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.favorite.deleteMany({ where: { entityType: "VIEW", entityId: id } });
    activity({
      entityType: "VIEW",
      entityId: id,
      projectId: view.projectId,
      verb: "deleted",
      meta: { name: view.name },
    });
    emit({
      topic: view.projectId ? `project:${view.projectId}` : `workspace:${ctx.workspace.id}`,
      type: "view.deleted",
      payload: { id },
    });
    return { id };
  });
}

/** Pins a view to (or unpins it from) the sidebar. Personal, so no activity row. */
export async function setViewFavorite(ctx: WorkspaceCtx, id: string, favorite: boolean) {
  await loadForWrite(ctx, id);
  if (!favorite) {
    await db.favorite.deleteMany({
      where: { userId: ctx.actor.userId, entityType: "VIEW", entityId: id },
    });
    return { favorite: false };
  }
  const last = await db.favorite.findFirst({
    where: { userId: ctx.actor.userId, workspaceId: ctx.workspace.id },
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });
  await db.favorite.upsert({
    where: {
      userId_entityType_entityId: { userId: ctx.actor.userId, entityType: "VIEW", entityId: id },
    },
    create: {
      userId: ctx.actor.userId,
      workspaceId: ctx.workspace.id,
      entityType: "VIEW",
      entityId: id,
      sortKey: keyAfter(last?.sortKey ?? null),
    },
    update: {},
  });
  return { favorite: true };
}
