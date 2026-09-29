import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
// Worker-only secrets (Google service account, agent SSH key; D-027) live in
// worker.env, which the web process never loads.
loadEnv({ path: path.resolve(import.meta.dirname, "../../../worker.env"), quiet: true });

const optional = () =>
  z
    .string()
    .optional()
    .transform((v) => v || undefined);

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
    /* AI teammate (Phase 8). The SSH key lives only here (D-027). */
    /** Private key of the Warpgate user the agent's commands run as. */
    AGENT_SSH_KEY_FILE: optional(),
    /** Warpgate user; sessions log in as `<user>:<target>`. */
    AGENT_SSH_USER: z.string().default("dopl-agent"),
    WARPGATE_HOST: optional(),
    WARPGATE_PORT: z.coerce.number().int().default(2222),
    /** Warpgate's SSH host key, "SHA256:…" as `ssh-keygen -lf` prints it. */
    WARPGATE_HOST_KEY: optional(),
    /** Hard timeout per command. */
    AGENT_EXEC_TIMEOUT_SEC: z.coerce.number().int().min(5).max(7200).default(300),
    /** Dev and tests only: canned command output instead of SSH. */
    AGENT_EXEC_FAKE: z.stringbool().default(false),
    /** Dev and tests only: serve a fake Hermes on this port (agent profile baseUrl → it). */
    HERMES_FAKE_PORT: z.coerce.number().int().optional(),
    /** Dev and tests only: the MCP token the fake Hermes sends to /api/mcp. */
    HERMES_FAKE_MCP_TOKEN: optional(),
  })
  .refine((e) => !(e.NODE_ENV === "production" && e.GMAIL_FAKE_DIR), {
    message: "GMAIL_FAKE_DIR must not be set in production",
  })
  .refine((e) => !(e.NODE_ENV === "production" && (e.AGENT_EXEC_FAKE || e.HERMES_FAKE_PORT)), {
    message: "AGENT_EXEC_FAKE and HERMES_FAKE_PORT must not be set in production",
  });

export const env = schema.parse(process.env);
export type WorkerEnv = typeof env;
