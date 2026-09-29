import "server-only";
import { env } from "../env";
import type { PublicResult } from "../services/public-intake";

/**
 * JSON responses for /api/public/* (D-008): never cached, never detailed.
 * A 429 carries Retry-After.
 */
export function respond<T>(result: PublicResult<T>, okStatus = 200): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (result.ok) return Response.json(result.data, { status: okStatus, headers });
  if (result.retryAfterSec) headers["Retry-After"] = String(result.retryAfterSec);
  return Response.json(
    { error: result.error, ...(result.fields ? { fields: result.fields } : {}) },
    { status: result.status, headers },
  );
}

/**
 * Public writes come from our own pages (/f, /s — embeds are iframes of
 * them), so a browser request from another origin is refused.
 */
export function foreignOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin !== null && origin !== new URL(env.APP_URL).origin;
}

export const forbidden = () =>
  Response.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
