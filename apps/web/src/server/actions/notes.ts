"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  convertNote,
  convertTodo,
  createNote,
  deleteTag,
  purgeNote,
  renameTag,
  reviewNote,
  setNoteArchived,
  setNoteDeleted,
  setTodoDue,
  toggleTodo,
  updateNote,
} from "../services/notes";

/* Thin entry points: auth context → service (zod + policy + tx) → typed result. */

export async function createNoteAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createNote(ctx, input));
}
export async function updateNoteAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => updateNote(ctx, input));
}
export async function setNoteArchivedAction(ws: string, id: string, archived: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setNoteArchived(ctx, id, archived));
}
export async function setNoteDeletedAction(ws: string, id: string, deleted: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setNoteDeleted(ctx, id, deleted));
}
export async function purgeNoteAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => purgeNote(ctx, id));
}
export async function toggleTodoAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => toggleTodo(ctx, input));
}
export async function setTodoDueAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setTodoDue(ctx, input));
}
export async function convertTodoAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => convertTodo(ctx, input));
}
export async function convertNoteAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => convertNote(ctx, input));
}
export async function reviewNoteAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => reviewNote(ctx, input));
}
export async function renameTagAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => renameTag(ctx, input));
}
export async function deleteTagAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => deleteTag(ctx, input));
}
