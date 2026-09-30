/**
 * Better Auth sends a failed Google or SSO sign-in back to the error callback
 * with `?error=<code>`. Core OAuth codes use underscores; the SSO plugin passes
 * some reasons through with spaces ("signup disabled"). This maps both to the
 * message the sign-in page shows (`auth.oauthErrors.*`).
 */
export type OAuthErrorKind = "notInvited" | "notLinked" | "noAccess" | "cancelled" | "failed";

const KINDS: Record<string, OAuthErrorKind> = {
  signup_disabled: "notInvited",
  account_not_linked: "notLinked",
  unable_to_link_account: "notLinked",
  email_does_not_match: "notLinked",
  account_already_linked_to_different_user: "notLinked",
  // The invite-only gate refused the session (no active membership or invite).
  unable_to_create_session: "noAccess",
  access_denied: "cancelled",
};

/**
 * Where Google and SSO send a failed sign-in: back to /sign-in, which reads
 * `?error=` and shows the reason. Without it the error went to the callback
 * URL ("/"), the proxy redirected that to a bare /sign-in, and the reason was
 * lost: the page just came back.
 */
export function signInErrorURL(via: "sso" | "google", next = "/"): string {
  const params = new URLSearchParams({ via });
  if (next !== "/") params.set("next", next);
  return `/sign-in?${params.toString()}`;
}

export function oauthErrorKind(code: string | null | undefined): OAuthErrorKind | null {
  if (!code) return null;
  const normalized = code
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  return KINDS[normalized] ?? "failed";
}
