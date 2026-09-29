import { execSync } from "node:child_process";
import path from "node:path";
import { config as loadEnv } from "dotenv";

/**
 * Brings the test database up to date with `migrate deploy` (non-destructive).
 * Tests never need a reset: each test creates its own workspace, so rows from
 * earlier runs can't interfere. CI starts from a fresh database anyway.
 */
export default function setup() {
  const root = path.resolve(import.meta.dirname, "..");
  loadEnv({ path: path.join(root, ".env"), quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  execSync("pnpm exec prisma migrate deploy", {
    cwd: path.join(root, "packages/db"),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
