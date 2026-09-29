"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  addLink,
  addRelation,
  bulkUpdateWorkItems,
  createWorkItem,
  createWorkItems,
  moveWorkItem,
  removeLink,
  removeRelation,
  moveToProject,
  patchManyWorkItems,
  setArchived,
  setArchivedMany,
  setDeletedMany,
  setSubscribed,
  updateWorkItem,
} from "../services/work-items";

/*
 * Thin entry points: auth context → service (zod + policy + tx) → typed
 * result. The client keeps TanStack Query caches in sync optimistically.
 */

export async function createWorkItemAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createWorkItem(ctx, input as never));
}
export async function createWorkItemsAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createWorkItems(ctx, input));
}
export async function updateWorkItemAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => updateWorkItem(ctx, input as never));
}
export async function bulkUpdateWorkItemsAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => bulkUpdateWorkItems(ctx, input));
}
export async function moveWorkItemAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => moveWorkItem(ctx, input));
}
export async function setArchivedAction(ws: string, id: string, archived: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setArchived(ctx, id, archived));
}
export async function setDeletedAction(ws: string, ids: string[], deleted: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setDeletedMany(ctx, ids, deleted));
}
export async function setArchivedManyAction(ws: string, ids: string[], archived: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setArchivedMany(ctx, ids, archived));
}
export async function patchManyWorkItemsAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => patchManyWorkItems(ctx, input));
}
export async function moveToProjectAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => moveToProject(ctx, input));
}
export async function addRelationAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => addRelation(ctx, input));
}
export async function removeRelationAction(ws: string, relationId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => removeRelation(ctx, relationId));
}
export async function addLinkAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => addLink(ctx, input));
}
export async function removeLinkAction(ws: string, linkId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => removeLink(ctx, linkId));
}
export async function setSubscribedAction(ws: string, id: string, subscribed: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setSubscribed(ctx, id, subscribed));
}
