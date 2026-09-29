"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import { mergeContacts, setContactBlocked, updateContact } from "../services/contacts";

export async function updateContactAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => updateContact(ctx, input));
}
export async function setContactBlockedAction(ws: string, id: string, blocked: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setContactBlocked(ctx, id, blocked));
}
export async function mergeContactsAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => mergeContacts(ctx, input));
}
