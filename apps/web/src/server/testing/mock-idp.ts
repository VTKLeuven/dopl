import { createServer, type Server } from "node:http";
import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";

/**
 * A minimal OpenID Connect provider for tests: discovery, an authorize
 * endpoint that signs in at once, token (RS256 id_token), JWKS and userinfo.
 * Whoever signs in is the `login_hint` email, unless `identities` maps that
 * hint to another profile (to test an IdP returning a different address).
 */
export interface MockIdentity {
  sub: string;
  email: string;
  name: string;
  emailVerified?: boolean;
}

export interface MockIdp {
  issuer: string;
  clientId: string;
  clientSecret: string;
  identities: Map<string, MockIdentity>;
  close(): Promise<void>;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export async function startMockIdp(port: number): Promise<MockIdp> {
  const issuer = `http://localhost:${port}`;
  const clientId = "dopl-test";
  const clientSecret = "dopl-test-secret";
  const kid = "test-key";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
  const identities = new Map<string, MockIdentity>();
  const codes = new Map<string, MockIdentity>();
  const tokens = new Map<string, MockIdentity>();

  const identityFor = (hint: string): MockIdentity =>
    identities.get(hint) ?? { sub: `sub-${hint}`, email: hint, name: hint.split("@")[0] ?? hint };

  function idToken(who: MockIdentity) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
    const payload = b64url(
      JSON.stringify({
        iss: issuer,
        aud: clientId,
        sub: who.sub,
        email: who.email,
        email_verified: who.emailVerified ?? true,
        name: who.name,
        iat: now,
        exp: now + 300,
      }),
    );
    const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey);
    return `${header}.${payload}.${b64url(signature)}`;
  }

  const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", issuer);
    if (url.pathname === "/.well-known/openid-configuration") {
      return json(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        userinfo_endpoint: `${issuer}/userinfo`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        scopes_supported: ["openid", "email", "profile", "offline_access"],
        code_challenge_methods_supported: ["S256"],
      });
    }
    if (url.pathname === "/jwks") return json(res, 200, { keys: [jwk] });
    if (url.pathname === "/authorize") {
      const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
      const code = randomUUID();
      codes.set(code, identityFor(url.searchParams.get("login_hint") ?? ""));
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { location: redirect.toString() });
      return res.end();
    }
    if (url.pathname === "/token" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        const who = codes.get(new URLSearchParams(body).get("code") ?? "");
        if (!who) return json(res, 400, { error: "invalid_grant" });
        const accessToken = randomUUID();
        tokens.set(accessToken, who);
        json(res, 200, {
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 300,
          id_token: idToken(who),
        });
      });
      return;
    }
    if (url.pathname === "/userinfo") {
      const who = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!who) return json(res, 401, { error: "invalid_token" });
      return json(res, 200, {
        sub: who.sub,
        email: who.email,
        email_verified: who.emailVerified ?? true,
        name: who.name,
      });
    }
    json(res, 404, { error: "not_found" });
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));

  return {
    issuer,
    clientId,
    clientSecret,
    identities,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
