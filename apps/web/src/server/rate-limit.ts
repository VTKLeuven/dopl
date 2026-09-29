import "server-only";
import { hashForKey } from "@dopl/shared/secretbox";
import { db } from "./db";
import { env } from "./env";

/**
 * Fixed-window counters in Postgres (D-025): one upsert per check, shared by
 * every web replica. Keys never contain raw IPs or emails, only salted hashes.
 */
export async function hitRateLimit(
  key: string,
  opts: { limit: number; windowSec: number },
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const windowMs = opts.windowSec * 1000;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_counters (key, "windowStart", count, "expiresAt")
    VALUES (${key}, ${windowStart}, 1, ${expiresAt})
    ON CONFLICT (key, "windowStart") DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count`;
  const count = Number(rows[0]?.count ?? 0);
  return {
    ok: count <= opts.limit,
    retryAfterSec: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
  };
}

export const keyHash = (value: string) =>
  hashForKey(value.trim().toLowerCase(), env.DOPL_ENCRYPTION_KEY);

/**
 * The client's IP as seen by Caddy (first X-Forwarded-For hop). The app is
 * only reachable through the reverse proxy (D-051), which sets the header.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
