"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  createDashboard,
  deleteDashboard,
  deleteWidget,
  moveWidget,
  resizeWidget,
  saveWidget,
  updateDashboard,
} from "../services/dashboards";

/* Thin entry points: auth context → service (zod + policy + tx) → typed result. */

export async function createDashboardAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createDashboard(ctx, input));
}
export async function updateDashboardAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => updateDashboard(ctx, input));
}
export async function deleteDashboardAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => deleteDashboard(ctx, id));
}
export async function saveWidgetAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => saveWidget(ctx, input));
}
export async function moveWidgetAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => moveWidget(ctx, input));
}
export async function resizeWidgetAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => resizeWidget(ctx, input));
}
export async function deleteWidgetAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => deleteWidget(ctx, id));
}
