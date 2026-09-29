"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  createWebhook,
  deleteWebhook,
  redeliver,
  sendTestMessage,
  updateWebhook,
} from "../services/webhooks";

export async function createWebhookAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createWebhook(ctx, input));
}
export async function updateWebhookAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => updateWebhook(ctx, input));
}
export async function deleteWebhookAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => deleteWebhook(ctx, id));
}
export async function sendTestMessageAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => sendTestMessage(ctx, id));
}
export async function redeliverAction(ws: string, deliveryId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => redeliver(ctx, deliveryId));
}
