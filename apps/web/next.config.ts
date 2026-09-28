import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

// One .env at the repo root serves web, worker and the Prisma CLI.
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", undefined, true);

const nextConfig: NextConfig = {
  // D-005: Instant Navigations from day one.
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  typedRoutes: true,
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@dopl/db", "@dopl/shared"],
  poweredByHeader: false,
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
