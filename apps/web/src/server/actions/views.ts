"use server";

import { refresh } from "next/cache";
import { run, type ActionResult } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import { createView, deleteView, setViewFavorite, updateView } from "../services/views";

// refresh() re-renders the sidebar (favourites) and view lists after a change.

export async function createViewAction(
  ws: string,
  input: unknown,
): Promise<ActionResult<{ id: string; name: string; projectId: string | null }>> {
  const ctx = await requireWorkspaceCtx(ws);
  const result = await run(() => createView(ctx, input as never));
  if (result.ok) refresh();
  return result;
}

export async function updateViewAction(
  ws: string,
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const ctx = await requireWorkspaceCtx(ws);
  const result = await run(() => updateView(ctx, input as never));
  if (result.ok) refresh();
  return result;
}

export async function deleteViewAction(
  ws: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireWorkspaceCtx(ws);
  const result = await run(() => deleteView(ctx, id));
  if (result.ok) refresh();
  return result;
}

export async function setViewFavoriteAction(
  ws: string,
  id: string,
  favorite: boolean,
): Promise<ActionResult<{ favorite: boolean }>> {
  const ctx = await requireWorkspaceCtx(ws);
  const result = await run(() => setViewFavorite(ctx, id, favorite));
  if (result.ok) refresh();
  return result;
}
