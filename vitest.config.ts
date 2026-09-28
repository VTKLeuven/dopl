import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Server modules guard themselves with `server-only`; tests run on the server.
      "server-only": path.resolve(import.meta.dirname, "test/empty-module.ts"),
      "@/": path.resolve(import.meta.dirname, "apps/web/src") + "/",
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**", "**/generated/**"],
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    // Integration tests share one test database; each test creates its own
    // workspace so files can run in parallel without cleanup.
    pool: "threads",
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
