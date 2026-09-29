import path from "node:path";
import { defineConfig } from "vitest/config";

/** `pnpm perf`: the Phase 2 performance pass (50k items). Not part of `pnpm test`. */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "test/empty-module.ts"),
      "@/": path.resolve(import.meta.dirname, "apps/web/src") + "/",
    },
  },
  test: {
    include: [process.env.PERF_FILE ?? "apps/*/src/**/*.perf.ts"],
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    testTimeout: 600_000,
    // The results table is the point of this run.
    silent: false,
    hookTimeout: 600_000,
  },
});
