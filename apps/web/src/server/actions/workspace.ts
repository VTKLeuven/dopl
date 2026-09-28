"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import { run } from "../action-result";
import { auth } from "../auth";
import { db } from "../db";
import { audit, withMutation } from "../mutation";
import { requireWorkspaceCtx } from "../session";
import { updateWorkspace } from "../services/workspace";

export async function updateWorkspaceAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(() => updateWorkspace(ctx, input));
  if (res.ok) refresh();
  return res;
}

const SsoProviderSchema = z.object({
  providerId: z.string().regex(/^[a-z0-9-]{2,40}$/, "Lowercase letters, digits and dashes."),
  issuer: z.url(),
  domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like vtk.be."),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

/** Admin-only SSO registration (the client route is disabled, D-050). */
export async function addSsoProviderAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(async () => {
    if (!canWorkspace(ctx.policyActor, "workspace.auth.manage")) throw new ForbiddenError();
    const p = SsoProviderSchema.parse(input);
    await auth.api.registerSSOProvider({
      body: {
        providerId: p.providerId,
        issuer: p.issuer,
        domain: p.domain,
        oidcConfig: { clientId: p.clientId, clientSecret: p.clientSecret, pkce: true },
      },
      headers: await headers(),
    });
    await withMutation(ctx, async ({ tx }) => {
      await audit(tx, ctx, { action: "auth.sso_provider_added", targetType: "SsoProvider", targetId: p.providerId, metadata: { issuer: p.issuer, domain: p.domain } });
    });
  });
  if (res.ok) refresh();
  return res;
}

export async function removeSsoProviderAction(ws: string, providerId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(async () => {
    if (!canWorkspace(ctx.policyActor, "workspace.auth.manage")) throw new ForbiddenError();
    await withMutation(ctx, async ({ tx }) => {
      await tx.ssoProvider.deleteMany({ where: { providerId } });
      await audit(tx, ctx, { action: "auth.sso_provider_removed", targetType: "SsoProvider", targetId: providerId });
    });
  });
  if (res.ok) refresh();
  return res;
}

export async function listSsoProviders() {
  return db.ssoProvider.findMany({ select: { providerId: true, issuer: true, domain: true } });
}
