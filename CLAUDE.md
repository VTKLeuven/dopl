# Dopl

Dopl is a self-hosted project-management, personal-notes and IT-team tool: Plane-style work items and views, Blinko-style notes and to-dos, a shared Gmail mailbox, team chat, and an AI teammate (Hermes Agent on the team's own model) with human approval for every infrastructure action.

**Status:** Phase 0 (plan) is done and waiting for approval. **Don't write application code until the plan is approved.** After approval, build phase by phase following `docs/ROADMAP.md`, and stop after each phase for review.

## Read first

| File | What it's for |
|---|---|
| `PROMPT.md` | The original brief. It wins over everything else. |
| `docs/ROADMAP.md` | Phases, tasks and acceptance criteria. Work top-down. |
| `docs/ARCHITECTURE.md` | Components, flows, auth/policy, agent integration, security model |
| `docs/DATA_MODEL.md` + `packages/db/prisma/schema.prisma` | The schema for all phases, with its invariants and indexes |
| `docs/DESIGN_SYSTEM.md` | Tokens, components, layouts, keyboard map. The quality bar. |
| `docs/DECISIONS.md` | Why things are the way they are (D-xxx). Add an entry for every non-obvious choice. |
| `docs/OPEN_QUESTIONS.md` | Unresolved questions (Q-xx) and the defaults in use until they're answered |

## Repository layout (target)

```
apps/web        Next.js 16.3 app: RSC, server actions, SSE, MCP, public forms
apps/worker     pg-boss 12 worker: Gmail sync, emails, notifications, agent runs, schedules
packages/db     Prisma 7 schema, prisma.config.ts, migrations (+ *_manual_* SQL), client, seed
packages/shared zod schemas, pure domain logic, policy, query keys, realtime types, email templates
docker/         compose files, Dockerfiles
docs/           plans, decisions, screenshots/phase-N/, CHANGELOG.md
```

## Commands (from Phase 1.1 onwards)

```bash
pnpm i                 # install (pnpm version pinned via packageManager / corepack)
pnpm db:up             # docker compose -f docker/compose.dev.yml up -d  (Postgres 17 + pgvector, Garage)
pnpm db:migrate        # prisma migrate dev   (then: pnpm db:generate)
pnpm db:generate       # prisma generate      (v7 does NOT run this automatically)
pnpm db:seed           # deterministic seed   (v7 does NOT auto-seed after migrate)
pnpm dev               # next dev (web) + worker in watch mode
pnpm typecheck         # tsc -b across the workspace
pnpm lint              # eslint (flat config) + prettier --check
pnpm test              # vitest (unit + integration against the test Postgres)
pnpm e2e               # playwright (smoke, visual, instant() tests)
pnpm db:drift          # prisma migrate diff migrations→schema; must print an empty migration
```

## Conventions

- **TypeScript:** strict, with `noUncheckedIndexedAccess`. No `any` in app code. Parse with zod at every boundary: action inputs, route handlers, JSON columns, MCP tool arguments, env (`env.ts`).
- **Authorization lives in one place.** Pure rules are in `@dopl/shared/policy`, and `apps/web/src/server/policy` enforces them. UI checks only hide things. Data access goes through `server/data` (reads) and `server/services` (writes), which require a `Ctx` from `requireActor()`. React components never import `@dopl/db`.
- **Every mutation** runs inside `withMutation(ctx, …)`. That validates, authorizes, changes data, writes `Activity`, writes a `realtime_events` row, `pg_notify`s, and enqueues side-effect jobs, **all in one transaction**.
- **Mutations** from the UI are server actions. Route handlers are only for public/embed endpoints, SSE, MCP, file redirects, webhooks and health checks. Public endpoints are rate-limited (`rate_limit_counters`).
- **Client data:** the RSC first page goes into `<HydrationBoundary>`, then TanStack Query with optimistic updates and rollback. Realtime events patch or invalidate using the shared query-key factory. Each piece of data has exactly one owner, either Query or `router.refresh()`, never both.
- **UI strings** always go through next-intl (`apps/web/messages/en.json`). No string literals in JSX.
- **Styling uses design tokens only.** No hex colours or magic pixel values in components. Use Tailwind v4 utilities backed by `@theme` variables.
- **Design review loop** for every UI task: run the app, take Playwright screenshots, compare them yourself against `docs/design/spott-reference.png`, fix alignment/spacing/type, then save to `docs/screenshots/phase-N/`. Fix inconsistencies you notice without being asked.
- **States:** every screen has designed empty, loading (skeleton, no layout shift) and error states.
- **Commits:** small and focused, imperative subject ("Add board drag between columns"). Branch off `main`. Commit or push only when asked.
- **Secrets** come from env vars only, and `.env.example` stays complete and commented. The Google service-account key and the agent SSH key are mounted **only in the worker** (D-027).

## Version gotchas: don't code from memory

- **Next.js 16.3**
  - Middleware is now **`proxy.ts`**. Turbopack is the default.
  - We run `cacheComponents: true` and `partialPrefetching: true` (D-005). Dynamic reads (`cookies()`, `headers()`, uncached DB) must sit under `<Suspense>` or in `'use cache'`/`'use cache: private'`. Follow the dev overlay's Instant insights. Use `export const instant = false` only as a last resort, with a comment explaining why.
  - `next lint` is gone; use the ESLint CLI.
  - Bundled, version-matched docs are in `node_modules/next/dist/docs/`. **Read the relevant guide before writing framework code.** Any docs URL + `.md` gives Markdown.
  - `next dev` maintains a managed block in `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`. Keep it and commit it.
- **Prisma 7**
  - **Pin 7.x.** npm's `latest` for `prisma` is already the 8.0 RC, and the CLI banner nags you to upgrade. Don't.
  - The URL lives in `packages/db/prisma.config.ts` (`import "dotenv/config"`), not in the schema.
  - The generator is `prisma-client` (ESM) with output in `src/generated/prisma`. Import from `@dopl/db`, never `@prisma/client`.
  - The `@prisma/adapter-pg` driver adapter is mandatory, and pool timeouts are set explicitly (v7 `pg` has **no** connect timeout by default).
  - `migrate dev` no longer runs `generate` or seeds.
  - Use the v7 docs at `prisma.io/docs/orm/v7/...`.
- **Migrations**
  - Hand-written SQL (`COLLATE "C"` on `sortKey`, CHECK constraints, the audit trigger, the `search` schema) goes in separate `*_manual_*` migrations.
  - Let Prisma create its own temporary shadow database. Don't set a fixed `shadowDatabaseUrl` in dev, or the `search` schema leaks between replays.
  - Never put HNSW or vector indexes in `public`: Prisma will try to drop them (verified, D-017).
- **IDs** are `uuid(7)` generated by the Prisma client. Raw SQL inserts must supply ids using `uuidv7()` from `@dopl/shared`.
- **Fractional sort keys** compare correctly only with `COLLATE "C"`. Never sort them in JavaScript with `localeCompare`; use plain `<` comparison.
- **Better Auth:** core field names must match its schema. `advanced.database.generateId: false`. Google uses `hd`, plus the domain hook. Magic links are guests-only with `disableSignUp`.
- **pg-boss 12** needs Node ≥ 22.12 (we use 24) and lives in the `pgboss` schema.
- **TypeScript 6.0.x**, not 7: typescript-eslint supports `<6.1`.
- **TanStack Table v9** is a rewrite, so read the v9 docs. dnd-kit: use `@dnd-kit/core` and `@dnd-kit/sortable`, not the pre-1.0 `@dnd-kit/react`. **Tailwind v4** is CSS-first (`@theme`), with no `tailwind.config.js`.
- **Hermes:** Dopl uses the API server's **Runs API** (`/v1/runs`, `/events` SSE, `/approval`, `/stop`) with `Idempotency-Key = AgentRun.id`. Answer approvals with `once` or `deny` only, never `session` or `always`.
- **Gmail:**
  - Use `messages.get(format=full)`, and fetch attachments lazily.
  - `history.list` returning 404 means a full resync.
  - Renew `users.watch` daily.
  - A Google Group address can't be synced; connect a real mailbox.

## Security rules (non-negotiable)

- Content from intake forms, emails, contacts and guests is **untrusted**. It is never sent to the agent automatically, and any run that sees it (at start or via an MCP read) is tainted: every action then needs approval (D-033).
- Infrastructure is reachable only through Dopl's `infra_exec` tool, with its host allowlist, DENY rules, read-only allowlist and human approval. The worker runs the command over SSH via Warpgate (D-031).
- Email HTML is rendered only as `bodyHtmlSanitized`, inside a sandboxed iframe with no `allow-scripts` and no `allow-same-origin` (D-028).
- `audit_logs` is append-only (a DB trigger enforces it). Auth, role, settings, mailbox and agent events must be audit-logged.

## Licensing

Plane (AGPL-3.0) and Blinko (GPL-3.0) are **inspiration only**: don't copy their code, schemas, styles or assets. Spott is proprietary: match its *feel*, not its assets. Hermes Agent (MIT) runs as a separate service. Reference clones, when needed, go in a temp directory **outside** this repo.
