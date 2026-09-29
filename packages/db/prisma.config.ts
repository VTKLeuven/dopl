// Prisma 7 configuration. The CLI no longer loads .env on its own, so we load
// the repo-root .env explicitly. Keep in sync with docs/DECISIONS.md D-010.
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed/index.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // No shadowDatabaseUrl on purpose: Prisma creates and drops a fresh
    // temporary shadow DB, so the hand-written `search` schema can't leak
    // between replays (D-015).
  },
});
