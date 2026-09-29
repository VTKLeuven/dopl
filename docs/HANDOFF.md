# Dopl: handoff

Where the project stands and how to pick it up. Written 2026-09-29, after Phases 0–2. If you're a new Claude Code session: read this first, then `CLAUDE.md` (conventions and version gotchas), then the relevant part of `docs/ROADMAP.md`.

---

## 1. Where things stand

Dopl is a self-hosted project-management tool for the VTK IT team:

- Plane-style work items and views
- Blinko-style notes (Phase 5)
- a shared Gmail mailbox (Phase 7)
- team chat (Phase 4)
- an AI teammate on Hermes Agent (Phase 8)

It's public at `dopl.vtk.be` and invite-only. The brief is `PROMPT.md`.

| Phase    | State                         | Summary                                                                                        |
| -------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| 0 Plan   | ✅ approved                   | Plan docs, full Prisma schema for every phase                                                  |
| 1 Core   | ✅ built, **awaiting review** | Auth, shell, projects, work items, list/board, peek, comments, attachments, Home               |
| 2 Views  | ✅ built, **awaiting review** | Filters, table/calendar/timeline, saved + workspace views, ⌘K, shortcuts, bulk, realtime, perf |
| 3 Intake | next                          | Triage queue, guest requests, public feedback forms, email-to-intake, Discord webhooks         |
| 4–8      | planned                       | Inbox & chat · Notes & My Work · Analytics · Shared mailbox · AI teammate                      |

- **What each phase delivered:** `docs/CHANGELOG.md`.
- **What's left over from each phase:** the unticked boxes under Phase 1 and Phase 2 in `docs/ROADMAP.md`.
- **Screenshots:** `docs/screenshots/phase-1/` and `docs/screenshots/phase-2/`.

**The owner's review is pending for Phases 1 and 2.** The process in the brief is to stop after each phase. Before starting Phase 3, ask the user to look at the screenshots and confirm, or collect their feedback.

Everything is committed and pushed to `main` on `github.com/d1ff1cult0/dopl`.

---

## 2. Run it locally

Prerequisites:

- Node 24 (`.nvmrc`)
- pnpm 10.34.6 (pinned via `packageManager`)
- Docker (OrbStack on the dev Mac)

```bash
pnpm i
cp .env.example .env          # already present on the dev Mac; every variable is commented
pnpm db:up                    # Postgres 17 + pgvector on :54320, Mailpit SMTP :1025 / UI :8025
pnpm db:deploy && pnpm db:generate
pnpm db:seed                  # workspace "VTK IT" at /vtk, 5 projects, ~300 items
pnpm dev                      # web on :3000 + worker (email jobs, maintenance)
```

Open <http://localhost:3000/sign-in>.

| Account                              | Password                | Notes                                                                                         |
| ------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| `owner@dopl.test`                    | `correct-horse-battery` | Owner (created by `pnpm dopl:bootstrap`). Will be asked to enrol 2FA (password + admin rule). |
| `ann@dopl.test`                      | `dopl-dev-password`     | Admin → also asked to enrol 2FA on first sign-in                                              |
| `bram@dopl.test`                     | `dopl-dev-password`     | Member. **The e2e tests sign in as Bram.**                                                    |
| `chloe@`, `dries@`, `emma@dopl.test` | `dopl-dev-password`     | Members                                                                                       |
| `guest@example.test`                 | `dopl-dev-password`     | Guest                                                                                         |

Mail sent in dev (invites, magic links, resets) lands in Mailpit: <http://localhost:8025>.

**Manual testing changes seed data** (priorities, layouts, filters, saved views). `pnpm db:seed -- --reset` rebuilds the seeded projects and clears view preferences; users are kept.

---

## 3. Checks

```bash
pnpm typecheck && pnpm lint && pnpm test     # 124 Vitest tests; integration tests use DATABASE_URL_TEST
pnpm e2e                                      # 21 Playwright tests + setup; needs `pnpm dev` and the seeded DB
pnpm perf                                     # 50k-item benchmark on the test DB (~40 s, not in CI)
pnpm db:drift                                 # schema vs migrations must be empty
```

CI (`.github/workflows/ci.yml`):

- It runs typecheck, lint (including `prettier --check`), Vitest, the drift check, `pnpm build` and the Playwright suite against a freshly seeded database.
- On `main` it also builds and pushes the Docker images to GHCR.
- Newer pushes cancel older runs.
- Check its result before calling a phase done: `gh api repos/d1ff1cult0/dopl/actions/runs --jq '.workflow_runs[:3][] | "\(.status) \(.conclusion) \(.head_sha[:7])"'`.

---

## 4. Code map

```
apps/web/src
  app/(auth)/…                 sign-in, 2FA, reset password, invite acceptance
  app/(app)/[ws]/…             home, projects, p/[ident]/items|views|settings, views (workspace), i/[ref], settings
  app/api/auth/[...all]        Better Auth
  app/api/v1/[ws]/…            internal JSON reads for TanStack Query (D-054) + /realtime (SSE)
  server/
    services/                  every write: zod → policy → withMutation (Activity + realtime outbox)
    queries/                   reads: work-items (lists, detail), filters (AST → Prisma), views, palette, workspace-items
    actions/                   thin server actions over services, return ActionResult
    realtime/                  LISTEN hub + per-connection topic access (D-063)
    mutation.ts, session.ts, auth.ts, api.ts
  features/
    work-items/                list, board (+ swimlanes), table, calendar, timeline, peek/detail, pickers, data hooks
    filters/                   builder + chip bar
    views/                     save dialog, view menu, views list
    palette/                   "current item" store for ⌘K
    realtime/                  client provider (query invalidation)
  components/                  ui primitives (re-themed Radix), shell (sidebar, header, palette, shortcuts overlay), editor (Tiptap)
  lib/shortcuts/registry.ts    the one shortcut registry (D-068)
packages/shared/src            zod schemas (work-item, view, filters…), policy, dates, sort keys, rich text, email templates
packages/db                    schema.prisma (all phases), migrations, client, seed, bootstrap
apps/worker                    pg-boss: email.send, maintenance.prune
```

Patterns to follow (details in `CLAUDE.md`):

- **Writes** go through a service inside `withMutation`, which writes the Activity and realtime rows in the same transaction.
- **Authorization** is decided only in `@dopl/shared/policy`.
- **Client data** comes from TanStack Query with optimistic updates. The cache keys live in `features/work-items/data.ts`, and realtime invalidates them.
- **Every UI string** is in `apps/web/messages/en.json`, and every colour is a token.

---

## 5. Gotchas learned the hard way

- **Prisma refuses `migrate reset` when run by an AI agent.** Don't work around it. Tests use `migrate deploy` plus a separate workspace per test (D-061).
- **Don't build the Docker images locally.** It crashed OrbStack twice; CI builds them. A local `pnpm build` is fine.
- **After adding a route**, run `npx next typegen` in `apps/web` or `PageProps` and `RouteContext` won't typecheck.
- **After `pnpm add` in `apps/web`**, restart the dev server and delete `apps/web/.next/dev` (stale Turbopack modules).
- **Next keeps the previous route mounted but hidden**, so a test id can match twice. In Playwright, use `.filter({ visible: true })`.
- **Don't use `networkidle` in tests.** The realtime SSE stream never idles; wait for `html:not([data-saving])` instead (D-070).
- **`.gitignore` patterns without a leading `/` match at any depth.** `storage/` once hid `apps/web/src/server/storage/` from git.
- **`apps/web` uses ESLint 9 and the packages use ESLint 10** (D-058). pnpm stays on 10 (D-057). Prisma stays on 7 (D-049).
- **The e2e setup empties the "E2E sandbox" project** on every run, so don't keep anything there.

---

## 6. Known gaps and open questions

Carried forward (also ticked off in ROADMAP as they get done):

- Playwright visual baselines, an axe check on `/dev/ui`, and a lint rule against raw hex values (from Phase 1).
- The SSO sign-in flow isn't tested end to end against a mock OIDC provider. Registering providers works.
- Unfiltered lists above about 3,000 rows exceed the 50 ms target: they take 40–70 ms (D-062).
- Realtime: changed fields don't flash yet, and there's no one-stream-per-browser leader tab (D-063).
- Shortcuts without handlers: `T`, `E`, `M` (peek), `[`. Creating items from a cross-project view isn't possible yet.
- Moved items' old identifiers don't redirect (Q-23).

Open questions for the user are in `docs/OPEN_QUESTIONS.md`. The ones that block upcoming work:

- **Q-21:** which SSO identity provider.
- **Q-22:** which Discord channels get which events (needed for Phase 3).
- **Q-20:** who sets up the Google Cloud pieces (OAuth, service account, Pub/Sub).
- **Q-16, Q-17, Q-18:** mailbox, Warpgate and model details (Phases 7–8).

---

## 7. Next steps

1. Get the user's review of Phases 1–2 and fix what they flag.
2. **Phase 3: Intake** (ROADMAP §Phase 3). The data model already exists (`IntakeItem`, `IntakeForm*`, `Contact`, `OutgoingWebhook`, `WebhookDelivery`). It covers:
   - the triage queue
   - guest "New request" and "My requests"
   - public feedback forms with an embed snippet (Plane pain point #2)
   - email-to-intake (after Phase 7's mailbox, or a forwarding address)
   - the Discord webhook framework (D-052)
3. Keep the phase routine:
   - Build in small commits.
   - Take screenshots into `docs/screenshots/phase-3/`.
   - Add a CHANGELOG entry, a ROADMAP status block and DECISIONS entries.
   - Update this handoff.
   - Stop for review.

## 8. Working with the user

- **Never add `Co-Authored-By: Claude`** or any other AI attribution to commits or PRs.
- **Pushing to `main` is fine**; they asked for it.
- **Stop after each phase** and show the screenshots.
- **Match the Spott reference's feel and the Dopl colours.** Plane and Blinko are inspiration only: never copy their code, schemas, styles or assets.
