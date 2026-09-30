import "server-only";
import { z } from "zod";
import { isAPIError } from "better-auth/api";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import { ConflictError } from "../action-result";
import { auth } from "../auth";
import { audit, withMutation } from "../mutation";
import type { WorkspaceCtx } from "../session";

const SsoProviderSchema = z.object({
  providerId: z.string().regex(/^[a-z0-9-]{2,40}$/, "Lowercase letters, digits and dashes."),
  issuer: z.url(),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like vtk.be."),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

/** Better Auth's OIDC discovery failures (`APIError.body.code`) that the form explains. */
const SSO_DISCOVERY_CODES = new Set([
  "discovery_untrusted_origin",
  "discovery_not_found",
  "discovery_timeout",
  "discovery_private_host",
  "discovery_invalid_url",
  "discovery_invalid_json",
  "discovery_incomplete",
  "discovery_unexpected_error",
  "issuer_mismatch",
  "oidc_endpoint_redirect",
  "unsupported_token_auth_method",
]);

/** Turns the registration failures an admin can fix into coded results instead of `server_error`. */
function ssoRegistrationError(err: unknown): unknown {
  if (!isAPIError(err)) return err;
  const code: unknown = err.body?.code;
  if (typeof code === "string" && SSO_DISCOVERY_CODES.has(code)) return new ConflictError(code);
  // A provider id that already exists or is reserved (google, credential, …).
  if (err.status === "UNPROCESSABLE_ENTITY") return new ConflictError("provider_id_unavailable");
  return err;
}

function assertAuthAdmin(ctx: WorkspaceCtx) {
  if (!canWorkspace(ctx.policyActor, "workspace.auth.manage")) throw new ForbiddenError();
}

/**
 * Admin-only SSO registration (the client route is disabled, D-050). Better
 * Auth runs OIDC discovery against the issuer, which must sit on an origin in
 * SSO_TRUSTED_ORIGINS (D-127). `headers` carry the admin's session.
 */
export async function addSsoProvider(ctx: WorkspaceCtx, input: unknown, headers: Headers) {
  assertAuthAdmin(ctx);
  const p = SsoProviderSchema.parse(input);
  try {
    await auth.api.registerSSOProvider({
      body: {
        providerId: p.providerId,
        issuer: p.issuer,
        domain: p.domain,
        oidcConfig: { clientId: p.clientId, clientSecret: p.clientSecret, pkce: true },
      },
      headers,
    });
  } catch (err) {
    throw ssoRegistrationError(err);
  }
  await withMutation(ctx, async ({ tx }) => {
    // An admin registering the provider, on an origin the operator allowlisted,
    // is what makes it trusted for its domain: its sign-ins may link to users
    // with an address on that domain (D-131). The DNS token the plugin issues
    // for self-service verification isn't used.
    await tx.ssoProvider.update({
      where: { providerId: p.providerId },
      data: { domainVerified: true },
    });
    await tx.verification.deleteMany({
      where: { identifier: `_better-auth-token-${p.providerId}` },
    });
    await audit(tx, ctx, {
      action: "auth.sso_provider_added",
      targetType: "SsoProvider",
      targetId: p.providerId,
      metadata: { issuer: p.issuer, domain: p.domain },
    });
  });
}

export async function removeSsoProvider(ctx: WorkspaceCtx, providerId: string) {
  assertAuthAdmin(ctx);
  await withMutation(ctx, async ({ tx }) => {
    await tx.ssoProvider.deleteMany({ where: { providerId } });
    await audit(tx, ctx, {
      action: "auth.sso_provider_removed",
      targetType: "SsoProvider",
      targetId: providerId,
    });
  });
}
