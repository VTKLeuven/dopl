import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts small secrets at rest (webhook URLs, which embed a token) with
 * AES-256-GCM under DOPL_ENCRYPTION_KEY. Format: `v1.<iv>.<tag>.<data>`,
 * base64url parts. Used by web (to store) and worker (to read).
 */
function keyFrom(secret: string): Buffer {
  const raw = Buffer.from(secret, "base64");
  // A 32-byte base64 key is used as is; anything else is hashed to 32 bytes.
  return raw.length === 32 ? raw : createHash("sha256").update(secret).digest();
}

export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function openSecret(sealed: string, secret: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Stable, salted hash for rate-limit keys and logs (never store raw IPs). */
export function hashForKey(value: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${value}`).digest("base64url").slice(0, 32);
}
