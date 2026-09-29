// Bundles the worker (and the workspace TS packages it imports) into
// dist/main.js. Third-party npm packages stay external and are installed in
// the production image via `pnpm deploy`.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith("@dopl/"));
// @dopl/db's own runtime deps must stay external too.
external.push(
  "@prisma/client",
  "@prisma/adapter-pg",
  "pg",
  "dotenv",
  "zod",
  "fractional-indexing",
  "pino-pretty",
);

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  external,
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
console.log("worker bundled → dist/main.js");
