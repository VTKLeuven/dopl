import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * SSO sign-in end to end against a mock OpenID provider (D-131): an admin
 * registers it, an invited user signs in and is linked, and the failures come
 * back to /sign-in with a reason. The provider's origin has to be trusted
 * before `auth` loads, hence the hoisted env.
 */
const MOCK = vi.hoisted(() => {
  const port = 41000 + Math.floor(Math.random() * 20000);
  process.env.SSO_TRUSTED_ORIGINS = `http://localhost:${port}`;
  return { port };
});

import { auth } from "../auth";
import { db } from "../db";
import { oauthErrorKind } from "@/lib/oauth-error";
import { makeMember, makeWorkspace } from "../testing/fixtures";
import { startMockIdp, type MockIdp } from "../testing/mock-idp";
import { inviteMembers } from "./members";
import { addSsoProvider } from "./sso";

let idp: MockIdp;
beforeAll(async () => {
  idp = await startMockIdp(MOCK.port);
});
afterAll(async () => {
  await idp.close();
});

const uniq = () => Math.random().toString(36).slice(2, 8);

/** "a=1; Path=/, b=2; …" → "a=1; b=2" */
function cookieHeader(setCookie: string | null): string {
  if (!setCookie) return "";
  return setCookie
    .split(/,(?=\s*[^;=\s]+=)/)
    .map((c) => c.split(";")[0]!.trim())
    .join("; ");
}

/** A signed-in admin whose session headers can register a provider. */
async function signedInAdmin() {
  const ws = await makeWorkspace();
  const ctx = await makeMember(ws, "ADMIN", "Ada Admin");
  const password = `pw-${uniq()}-${uniq()}`;
  const hash = await (await auth.$context).password.hash(password);
  await db.account.create({
    data: {
      userId: ctx.actor.userId,
      providerId: "credential",
      accountId: ctx.actor.userId,
      password: hash,
    },
  });
  const signIn = await auth.api.signInEmail({
    body: { email: ctx.actor.email, password },
    returnHeaders: true,
  });
  const headers = new Headers({ cookie: cookieHeader(signIn.headers.get("set-cookie")) });
  return { ctx, headers };
}

async function setUp() {
  const { ctx, headers } = await signedInAdmin();
  const domain = `${uniq()}.sso.test`;
  const providerId = `mock-${uniq()}`;
  await addSsoProvider(
    ctx,
    {
      providerId,
      issuer: idp.issuer,
      domain,
      clientId: idp.clientId,
      clientSecret: idp.clientSecret,
    },
    headers,
  );
  return { ctx, domain, providerId };
}

/**
 * What the browser does: start SSO for `email`, follow the IdP's redirect back
 * and call Dopl's callback with the state cookie. Returns where Dopl sends the
 * browser and the cookies it sets.
 */
async function ssoSignIn(email: string, providerId: string) {
  const start = await auth.api.signInSSO({
    body: { email, callbackURL: "/", errorCallbackURL: "/sign-in?via=sso" },
    returnHeaders: true,
  });
  const authorize = await fetch(start.response.url, { redirect: "manual" });
  const back = new URL(authorize.headers.get("location")!);
  expect(back.pathname).toBe(`/api/auth/sso/callback/${providerId}`);
  const res = await auth.api.callbackSSO({
    params: { providerId },
    query: { code: back.searchParams.get("code")!, state: back.searchParams.get("state")! },
    headers: new Headers({ cookie: cookieHeader(start.headers.get("set-cookie")) }),
    asResponse: true,
  });
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location")!, "http://dopl.local");
  return { location, setCookie: res.headers.get("set-cookie") ?? "" };
}

describe("SSO sign-in", () => {
  it("registers a provider that is trusted for its domain", async () => {
    const { providerId, domain } = await setUp();
    const row = await db.ssoProvider.findUniqueOrThrow({ where: { providerId } });
    expect(row).toMatchObject({ domain, domainVerified: true });
  });

  it("links an invited user on the provider's domain and starts their session", async () => {
    const { ctx, domain, providerId } = await setUp();
    const email = `new.person@${domain}`;
    await inviteMembers(ctx, { emails: email, role: "MEMBER", projectIds: [] });

    const { location, setCookie } = await ssoSignIn(email, providerId);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("error")).toBeNull();
    expect(setCookie).toMatch(/dopl\.session_token=/);

    const user = await db.user.findUniqueOrThrow({
      where: { email },
      select: {
        accounts: { select: { providerId: true } },
        memberships: { where: { workspaceId: ctx.workspace.id }, select: { status: true } },
      },
    });
    expect(user.accounts.map((a) => a.providerId)).toContain(providerId);
    // The first sign-in accepts the invite.
    expect(user.memberships).toEqual([{ status: "ACTIVE" }]);
  });

  it("sends an address without an invite back to sign-in as not invited", async () => {
    const { domain, providerId } = await setUp();
    const { location, setCookie } = await ssoSignIn(`stranger@${domain}`, providerId);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("via")).toBe("sso");
    expect(oauthErrorKind(location.searchParams.get("error"))).toBe("notInvited");
    expect(setCookie).not.toMatch(/dopl\.session_token=[^;]/);
  });

  it("won't link an account outside the provider's domain", async () => {
    const { ctx, domain, providerId } = await setUp();
    // The IdP answers for someone on its domain with a Dopl admin's address.
    const hint = `mallory@${domain}`;
    idp.identities.set(hint, { sub: `sub-${uniq()}`, email: ctx.actor.email, name: "Mallory" });

    const { location, setCookie } = await ssoSignIn(hint, providerId);
    expect(location.pathname).toBe("/sign-in");
    expect(oauthErrorKind(location.searchParams.get("error"))).toBe("notLinked");
    expect(setCookie).not.toMatch(/dopl\.session_token=[^;]/);
    const accounts = await db.account.findMany({
      where: { userId: ctx.actor.userId },
      select: { providerId: true },
    });
    expect(accounts.map((a) => a.providerId)).toEqual(["credential"]);
  });
});
