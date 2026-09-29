import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  DOPL_ENCRYPTION_KEY: z.string().min(32),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".data/uploads"),
  // Optional Cloudflare Turnstile for public forms (Phase 3).
  TURNSTILE_SITE_KEY: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  TURNSTILE_SECRET_KEY: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  // Worker-only secrets (D-027): the internet-facing web process must never
  // see them. They belong in worker.env, which only the worker loads.
  GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z
    .string()
    .optional()
    .refine((v) => !v, "GOOGLE_SERVICE_ACCOUNT_KEY_FILE belongs in worker.env, not the web's env"),
  AGENT_SSH_KEY_FILE: z
    .string()
    .optional()
    .refine((v) => !v, "AGENT_SSH_KEY_FILE belongs in worker.env, not the web's env"),
});

export const env = schema.parse(process.env);
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const turnstileEnabled = Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
