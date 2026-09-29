"use server";

import { refresh } from "next/cache";
import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import * as svc from "../services/project-settings";

async function act<T>(ws: string, fn: (ctx: Awaited<ReturnType<typeof requireWorkspaceCtx>>) => Promise<T>) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(() => fn(ctx));
  if (res.ok) refresh();
  return res;
}

export async function updateProjectAction(ws: string, input: unknown) {
  return act(ws, (ctx) => svc.updateProject(ctx, input));
}
export async function setProjectArchivedAction(ws: string, projectId: string, archived: boolean) {
  return act(ws, (ctx) => svc.setProjectArchived(ctx, projectId, archived));
}
export async function createStateAction(ws: string, input: unknown) {
  return act(ws, (ctx) => svc.createState(ctx, input));
}
export async function updateStateAction(ws: string, input: unknown) {
  return act(ws, (ctx) => svc.updateState(ctx, input));
}
export async function deleteStateAction(ws: string, stateId: string, reassignToId: string) {
  return act(ws, (ctx) => svc.deleteState(ctx, stateId, reassignToId));
}
export async function createLabelAction(ws: string, input: unknown) {
  return act(ws, (ctx) => svc.createLabel(ctx, input));
}
export async function updateLabelAction(ws: string, input: unknown) {
  return act(ws, (ctx) => svc.updateLabel(ctx, input));
}
export async function deleteLabelAction(ws: string, labelId: string) {
  return act(ws, (ctx) => svc.deleteLabel(ctx, labelId));
}
export async function setProjectMemberAction(ws: string, input: unknown) {
  return act(ws, (ctx) => svc.setProjectMember(ctx, input));
}
export async function removeProjectMemberAction(ws: string, projectId: string, userId: string) {
  return act(ws, (ctx) => svc.removeProjectMember(ctx, projectId, userId));
}
