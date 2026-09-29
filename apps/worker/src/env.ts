import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
// Worker-only secrets (Google service account, agent SSH key; D-027) live in
// worker.env, which the web process never loads.
loadEnv({ path: path.resolve(import.meta.dirname, "../../../worker.env"), quiet: true });

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
    WORKER_HEALTH_PORT: z.coerce.number().int().default(3001),
    APP_URL: z.url(),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int(),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().min(3),
    /** Decrypts webhook URLs stored by the web app (D-052). */
    DOPL_ENCRYPTION_KEY: z.string().min(32),
    /* Shared mailbox (Phase 7). Only the worker gets these (D-027). */
    /** Service-account JSON key with domain-wide delegation (docs/ops/gmail-setup.md). */
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z
      .string()
      .optional()
      .transform((v) => v || undefined),
    /** projects/<project>/topics/<topic> that Gmail publishes changes to. */
    GMAIL_PUBSUB_TOPIC: z
      .string()
      .optional()
      .transform((v) => v || undefined),
    /** projects/<project>/subscriptions/<subscription> the worker pulls from. */
    GMAIL_PUBSUB_SUBSCRIPTION: z
      .string()
      .optional()
      .transform((v) => v || undefined),
    /** Dev and tests only: a directory of fake mailboxes instead of Gmail. */
    GMAIL_FAKE_DIR: z
      .string()
      .optional()
      .transform((v) => v || undefined),
  })
  .refine((e) => !(e.NODE_ENV === "production" && e.GMAIL_FAKE_DIR), {
    message: "GMAIL_FAKE_DIR must not be set in production",
  });

export const env = schema.parse(process.env);
export type WorkerEnv = typeof env;
