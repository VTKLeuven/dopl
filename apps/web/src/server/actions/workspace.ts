"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { run } from "../action-result";
import { db } from "../db";
import { requireWorkspaceCtx } from "../session";
import { addSsoProvider, removeSsoProvider } from "../services/sso";
import { updateWorkspace } from "../services/workspace";

export async function updateWorkspaceAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(() => updateWorkspace(ctx, input));
  if (res.ok) refresh();
  return res;
}

/** Admin-only SSO registration (the client route is disabled, D-050). */
export async function addSsoProviderAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(async () => addSsoProvider(ctx, input, await headers()));
  if (res.ok) refresh();
  return res;
}

export async function removeSsoProviderAction(ws: string, providerId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(() => removeSsoProvider(ctx, providerId));
  if (res.ok) refresh();
  return res;
}

export async function listSsoProviders() {
  return db.ssoProvider.findMany({ select: { providerId: true, issuer: true, domain: true } });
}
