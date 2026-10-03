"use server";

import { updateTag } from "next/cache";
import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  acceptIntake,
  declineIntake,
  markDuplicate,
  reopenIntake,
  replyToRequest,
  snoozeIntake,
  submitRequest,
} from "../services/intake";
import {
  createForm,
  deleteForm,
  saveForm,
  setFormPublished,
  setIntakeEnabled,
} from "../services/intake-forms";
import type { AcceptIntakeInput, SaveFormInput } from "@dopl/shared/schemas/intake";
import { feedbackPageTag, publicFormTag } from "../queries/public-forms";

/* triage */
export async function acceptIntakeAction(ws: string, input: AcceptIntakeInput) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => acceptIntake(ctx, input));
}
export async function declineIntakeAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => declineIntake(ctx, input));
}
export async function markDuplicateAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => markDuplicate(ctx, input));
}
export async function snoozeIntakeAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => snoozeIntake(ctx, input));
}
export async function reopenIntakeAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => reopenIntake(ctx, id));
}

/* requests (guests and members) */
export async function submitRequestAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => submitRequest(ctx, input));
}
export async function replyToRequestAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => replyToRequest(ctx, input));
}

/* forms: saving refreshes the cached public pages (/f/<slug>, /feedback) right away */
const refreshForms = (slugs: string[]) => {
  for (const slug of slugs) updateTag(publicFormTag(slug));
  updateTag(feedbackPageTag);
};

export async function createFormAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createForm(ctx, input));
}
export async function saveFormAction(ws: string, input: SaveFormInput) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(async () => {
    const res = await saveForm(ctx, input);
    refreshForms(res.slugs);
    return { id: res.id };
  });
}
export async function setFormPublishedAction(ws: string, id: string, published: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(async () => {
    const res = await setFormPublished(ctx, id, published);
    refreshForms(res.slugs);
    return { id: res.id };
  });
}
export async function deleteFormAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(async () => {
    const res = await deleteForm(ctx, id);
    refreshForms(res.slugs);
    return { id: res.id };
  });
}
export async function setIntakeEnabledAction(ws: string, projectId: string, enabled: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(async () => {
    const res = await setIntakeEnabled(ctx, projectId, enabled);
    refreshForms(res.slugs);
    return null;
  });
}
