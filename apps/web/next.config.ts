import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

// One .env at the repo root serves web, worker and the Prisma CLI. Next has
// already loaded apps/web's (absent) env files, so force a reload from root.
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", undefined, true);

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // D-005: Instant Navigations from day one.
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  typedRoutes: true,
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@dopl/db", "@dopl/server", "@dopl/shared"],
  poweredByHeader: false,
  turbopack: {
    root: repoRoot,
  },
};

export default withNextIntl(nextConfig);
