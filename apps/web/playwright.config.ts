import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. They run against a dev server with the seeded database
 * (`pnpm db:seed`) and sign in through the real email+password flow with the
 * dev seed accounts — there is no test-only auth backdoor.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // CI's cold dev server on two shared cores fails a different timing-sensitive
  // test on most runs (D-114); one retry there, none locally, where they pass.
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    // Machines with a preinstalled Chromium (e.g. cloud dev containers) point
    // at it instead of downloading Playwright's build.
    ...(process.env.PW_CHROMIUM
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
      : {}),
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/member.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: `${baseURL}/sign-in`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
