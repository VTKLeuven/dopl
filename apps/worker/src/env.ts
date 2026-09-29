import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const schema = z.object({
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
});

export const env = schema.parse(process.env);
export type WorkerEnv = typeof env;
