"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import { createComment, editComment, setCommentDeleted, toggleReaction } from "../services/comments";

export async function createCommentAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createComment(ctx, input));
}
export async function editCommentAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => editComment(ctx, input));
}
export async function setCommentDeletedAction(ws: string, id: string, deleted: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setCommentDeleted(ctx, id, deleted));
}
export async function toggleReactionAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => toggleReaction(ctx, input));
}
