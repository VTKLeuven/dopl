"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  addEmailComment,
  assignThread,
  createMailbox,
  linkThread,
  promoteThread,
  setMailboxState,
  setThreadLabels,
  setThreadStatus,
  snoozeThread,
  syncMailboxNow,
  unlinkThread,
  updateMailbox,
} from "../services/mail";

/* Thin entry points: auth context → service (zod + policy + tx) → typed result. */

export async function createMailboxAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createMailbox(ctx, input));
}
export async function updateMailboxAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => updateMailbox(ctx, input));
}
export async function setMailboxStateAction(
  ws: string,
  id: string,
  action: "pause" | "resume" | "disconnect" | "test",
) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setMailboxState(ctx, id, action));
}
export async function syncMailboxNowAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => syncMailboxNow(ctx, id));
}
export async function assignThreadAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => assignThread(ctx, input));
}
export async function setThreadStatusAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setThreadStatus(ctx, input));
}
export async function snoozeThreadAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => snoozeThread(ctx, input));
}
export async function setThreadLabelsAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setThreadLabels(ctx, input));
}
export async function addEmailCommentAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => addEmailComment(ctx, input));
}
export async function promoteThreadAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => promoteThread(ctx, input));
}
export async function linkThreadAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => linkThread(ctx, input));
}
export async function unlinkThreadAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => unlinkThread(ctx, input));
}
