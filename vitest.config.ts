import { defineConfig } from "vitest/config";

export default defineConfig({
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
