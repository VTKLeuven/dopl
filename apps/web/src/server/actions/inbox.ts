"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  markAllRead,
  setNotificationPreference,
  snoozeNotifications,
  updateNotifications,
} from "../services/inbox";

export async function updateNotificationsAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => updateNotifications(ctx, input));
}
export async function snoozeNotificationsAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => snoozeNotifications(ctx, input));
}
export async function markAllReadAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => markAllRead(ctx, input));
}
export async function setNotificationPreferenceAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setNotificationPreference(ctx, input));
}
