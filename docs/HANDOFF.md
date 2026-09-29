# Dopl: handoff

Where the project stands and how to pick it up. Updated 2026-09-29, after Phase 7. If you're a new Claude Code session: read this first, then `CLAUDE.md` (conventions and version gotchas), then the relevant part of `docs/ROADMAP.md`.

**To start a new session**, open Claude Code in the repo and paste:

> Read `docs/HANDOFF.md`, then `CLAUDE.md` and `PROMPT.md`. Start the dev services (`pnpm db:up`, then `pnpm dev` in the background), check that `pnpm typecheck && pnpm test` pass and what CI says about the latest commit on `main`, and summarise where the project stands. Then build Phase 8 (ROADMAP §Phase 8) and stop for my review when it's done. Phase 8 needs answers to Q-17 and Q-18 first; ask for them if they're still open.

---

## 1. Where things stand

Dopl is a self-hosted project-management tool for the VTK IT team:

- Plane-style work items and views
- Blinko-style notes (Phase 5)
- a shared Gmail mailbox (Phase 7)
- team chat (Phase 4)
- an AI teammate on Hermes Agent (Phase 8)

It's public at `dopl.vtk.be` and invite-only. The brief is `PROMPT.md`.

| Phase             | State                         | Summary                                                                                          |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| 0 Plan            | ✅ approved                   | Plan docs, full Prisma schema for every phase                                                    |
| 1 Core            | ✅ approved                   | Auth, shell, projects, work items, list/board, peek, comments, attachments, Home                 |
| 2 Views           | ✅ approved                   | Filters, table/calendar/timeline, saved + workspace views, ⌘K, shortcuts, bulk, realtime, perf   |
| 3 Intake          | ✅ built, **awaiting review** | Triage queue, public forms + embeds, status page, guest requests, contacts, Discord webhooks     |
| 4 Inbox & chat    | ✅ built, **awaiting review** | Notifications, Inbox, preferences + digests, channels, DMs, threads, typing, leader-tab realtime |
| 5 Notes & My Work | ✅ built, **awaiting review** | Quick capture, notes grid, tags, to-dos, sharing, daily review, Home / My Work (5b waits on Q-6) |
| 6 Analytics       | ✅ built, **awaiting review** | Metrics, nightly snapshots, built-in and custom dashboards, chart builder                        |
| 7 Shared mailbox  | ✅ built, **awaiting review** | Gmail sync (fake Gmail in dev), Mail views and reader, promote/link to items, replies            |
| 8 AI teammate     | **next** (needs Q-17, Q-18)   | Hermes runs, MCP tools, `infra_exec` with approvals                                              |

- **What each phase delivered:** `docs/CHANGELOG.md`.
- **What's left over from each phase:** the unticked boxes under each phase in `docs/ROADMAP.md`.
- **Screenshots:** `docs/screenshots/phase-1/` to `docs/screenshots/phase-7/`.

**The owner approved Phases 1 and 2** and asked for 3 and 4 in one go. Phases 3 to 7 are built and merged (the owner asked for Phases 6 and 7 right after the one before); their reviews are still pending, so show the screenshots in `docs/screenshots/phase-3/` to `docs/screenshots/phase-7/` at the start of the next session.

Everything is committed and pushed to `main` on `github.com/d1ff1cult0/dopl`. The dev workspace slug is `vtk` (URLs look like `/vtk/p/INFRA/items`).

### 1.1 Phase 4 status

Phase 4 was built by a background agent in a worktree and merged into `main` together with Phase 3.

- **What's in it:** the Inbox (`/vtk/inbox`), Settings → Notifications with a 10-minute email digest, Messages (`/vtk/messages`: project, public, private and DM channels, threads, reactions, attachments, typing) and one realtime stream per browser. Details are in `docs/CHANGELOG.md`; decisions are D-080 to D-091; carry-overs are unticked under Phase 4 in `docs/ROADMAP.md`.
- **No migrations, no new env vars.** New worker queue: `email.digest` (every 10 minutes).
- **Checks after the merge:** typecheck, lint, 192 Vitest tests and the drift check pass. The full Playwright suite (31 tests + setup) is green after two fixes the merge run turned up (see the Phase 4 CHANGELOG under "Fixes" and D-091).
- **Deployment:** Caddy must not buffer the realtime route:

  ```caddyfile
  dopl.vtk.be {
  	@realtime path_regexp realtime ^/api/v1/[^/]+/realtime$
  	reverse_proxy @realtime web:3000 {
  		flush_interval -1
  	}
  	reverse_proxy web:3000
  }
  ```

  The route already sends `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, and a `ping` event every 20 s keeps idle proxies from closing it.

- **Open questions it raised:** Q-25 to Q-28 (DMs in the Inbox, email defaults, chat for guests, chat retention). The defaults are in use.
- **The chat e2e tests** use Chloé (`chloe@dopl.test`) as the second person, because Ann is asked to enrol in 2FA. They write only in the "E2E sandbox" channel and in new `e2e-*` channels.

### 1.2 Phase 5 status

Phase 5 was built on `claude/phase-5` from the unfinished `wip/phase-5-notes` branch (its domain, services and tests were kept; the UI was finished, fixed and verified) and merged into `main`.

- **What's in it:** Notes (`/vtk/notes`: quick capture, masonry grid, colours, pins, inline editing, archive, trash, sharing, search), the tag tree with rename/merge/delete, My to-dos (`/vtk/notes/todos`), converting a line or a note into a work item, the daily review (`/vtk/notes/review`), `Q` from any page, notes in ⌘K, and Home rebuilt as My Work. Details are in `docs/CHANGELOG.md`; decisions are D-092 to D-098; carry-overs are unticked under Phase 5 in `docs/ROADMAP.md`.
- **No migrations, no new env vars, no new queues.** The nightly `maintenance.prune` now also purges notes trashed 30 days ago.
- **Seed:** ten notes (§2). The e2e tests capture their own notes as Bram with unique text, so seeded notes don't get in the way.
- **Screenshots:** `docs/screenshots/phase-5/` (18, including two at phone width).
- **Open question it raised:** Q-29 (can teammates edit shared notes?). The default (read-only) is in use.
- **5b** (embeddings, semantic search, "Ask my notes") still waits on Q-6.

### 1.3 Phase 6 status

Phase 6 was built on `claude/phase-6` and merged into `main`.

- **What's in it:** Analytics at `/vtk/analytics` (the built-in overview, your dashboards, shared ones) and `/vtk/p/<IDENT>/analytics` (a project's overview), the chart builder, eleven metrics, and the nightly `analytics.snapshot` job. Details are in `docs/CHANGELOG.md`; decisions are D-099 to D-106; carry-overs are unticked under Phase 6 in `docs/ROADMAP.md`.
- **No migrations, no new env vars.** New worker queue: `analytics.snapshot` (23:55 daily). New dependency: `recharts` 3 (and `react-is`, its peer).
- **Seed:** 120 days of approximated `project_daily_stats`.
- **Screenshots:** `docs/screenshots/phase-6/` (9, including the builder, the chart states and a phone).
- **Performance:** `PERF_FILE=apps/web/src/server/queries/analytics.perf.ts pnpm perf` times the heaviest charts at 50,000 items (numbers in D-100).

### 1.4 Phase 7 status

Phase 7 was built on `claude/phase-7` and merged into `main`.

- **What's in it:** Mail at `/vtk/mail` (views, reader, notes, assign, solve, snooze, labels, presence, replies, promote or link to an item), Settings → Mailboxes (connect, status page, sync log), the Gmail sync engine in the worker, email entries on item timelines, conversations on contact pages, Inbox notifications and Discord mail events. Details are in `docs/CHANGELOG.md`; decisions are D-107 to D-114; carry-overs are unticked under Phase 7 in `docs/ROADMAP.md`.
- **No real mailbox yet.** Everything runs against the file-backed fake Gmail (`GMAIL_FAKE_DIR=.data/fake-gmail` in `.env`, D-111). Connecting `it@vtk.be` for real needs Q-16 and Q-20 and the steps in `docs/ops/gmail-setup.md`.
- **Migration:** `20260929131612_mailbox_connection_test`. **New file:** `worker.env` (from `worker.env.example`) for the worker's Google key and Pub/Sub names; only the worker reads it (D-110). **New package:** `@dopl/server` (D-107). **New queues:** `gmail.test`, `gmail.backfill`, `gmail.sync`, `gmail.watch-renew` (03:40), `gmail.poll` (every 5 minutes), `gmail.fetch-attachment`, `gmail.send`. **New dependencies (worker):** `google-auth-library`, `dompurify` + `jsdom`.
- **Seed:** the `it@vtk.be` mailbox ("IT support", members Bram and Chloé, replies on) with six conversations. The worker connects it on its next poll, up to 5 minutes after seeding.
- **Screenshots:** `docs/screenshots/phase-7/` (10, including two at phone width).

### What the user has decided so far

These answers shape the plan; the details are in `docs/OPEN_QUESTIONS.md` (answered table) and `docs/DECISIONS.md`.

- **Stack:** as the brief says. Use Prisma 8 only once it's GA; it isn't, so the project stays on Prisma 7.10 (D-049).
- **Plane pain points Dopl must solve:**
  1. mail tracking (the shared mailbox, Phase 7)
  2. feedback forms in the free edition (intake forms, Phase 3)
  3. filtering done items out of a project's overview (done hidden by default, D-053, already built)
- **Accounts are invite-only** (D-050). Sign-in methods: email + password with 2FA, SSO, magic links and optional Google.
- **Hosting:** public at `dopl.vtk.be` behind Caddy (D-051). Outbound mail goes through the Google Workspace SMTP relay.
- **Discord webhooks** for updates, new tickets and new mail (D-052, Phase 3 onward).
- **Realtime** was pulled forward into Phase 2 (Q-9's default).
- **Q-16's default is in use** (one mailbox, 90-day import, no label mirroring); Q-20 is still open, so no real mailbox is connected.
- **Q-12, Q-19, Q-22 defaults are in use:** simplified public status wording; guests see only their own requests; Discord webhooks send titles and links only unless "Include content" is on, with events chosen per webhook.

---

## 2. Run it locally

Prerequisites:

- Node 24 (`.nvmrc`). Cloud containers ship Node 22: download Node 24 and put it first on `PATH` (`export PATH=/opt/node24/bin:$PATH` in every shell).
- pnpm 10.34.6 (pinned via `packageManager`)
- Docker (OrbStack on the dev Mac)

```bash
pnpm i
cp .env.example .env          # already present on the dev Mac; every variable is commented
pnpm db:up                    # Postgres 17 + pgvector on :54320, Mailpit SMTP :1025 / UI :8025
pnpm db:deploy && pnpm db:generate
pnpm db:seed                  # workspace "VTK IT" at /vtk, 5 projects, ~300 items, 10 notes, the it@vtk.be mailbox
pnpm dev                      # web on :3000 + worker (email, webhooks, snooze wake-ups, maintenance, Gmail sync)
```

Open <http://localhost:3000/sign-in>.

| Account                              | Password                | Notes                                                                                         |
| ------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| `owner@dopl.test`                    | `correct-horse-battery` | Owner (created by `pnpm dopl:bootstrap`). Will be asked to enrol 2FA (password + admin rule). |
| `ann@dopl.test`                      | `dopl-dev-password`     | Admin → also asked to enrol 2FA on first sign-in                                              |
| `bram@dopl.test`                     | `dopl-dev-password`     | Member. **The e2e tests sign in as Bram.**                                                    |
| `chloe@`, `dries@`, `emma@dopl.test` | `dopl-dev-password`     | Members                                                                                       |
| `guest@example.test`                 | `dopl-dev-password`     | Guest: member of HELP and the E2E sandbox; sees **Requests**                                  |

Mail sent in dev (invites, magic links, resets) lands in Mailpit: <http://localhost:8025>.

**Manual testing changes seed data** (priorities, layouts, filters, saved views). `pnpm db:seed -- --reset` rebuilds the seeded projects and clears view preferences; users and contacts are kept.

Phase 7 seed data: `it@vtk.be` in the fake Gmail with six conversations (a printer thread with a reply, an HTML email with a tracking pixel and a script, an attachment, a newsletter). Bram and Chloé are members; Ann and the owner see it as admins in Settings → Mailboxes. To "receive" mail by hand, call `appendMessage` from `@dopl/shared/testing/fake-gmail` (see `e2e/mail.spec.ts`).

Phase 5 seed data: Bram has eight notes (nested `#infra/proxmox` tags, to-dos due today and this week, a pinned and an archived note, five due for the daily review); Chloé shares an on-call note with the team, and Dries has a note attached to INFRA.

Phase 3 seed data: the HELP project has a published form at <http://localhost:3000/f/it-support>, a draft form on INFRA, seven contacts (one blocked) and twelve requests in every triage state (`/vtk/p/HELP/intake`).

**Admin screens without 2FA in dev:** seeded admins use passwords, so they must enrol TOTP first. To look at admin-only pages quickly, delete the admin's credential row in the dev DB and sign in with a magic link from Mailpit (`DELETE FROM accounts a USING users u WHERE a."userId" = u.id AND u.email = 'ann@dopl.test' AND a."providerId" = 'credential';`). `pnpm db:seed` puts the password back.

---

## 3. Checks

```bash
pnpm typecheck && pnpm lint && pnpm test     # 279 Vitest tests after Phase 7; integration tests use DATABASE_URL_TEST
pnpm e2e                                      # 45 Playwright tests + setup after Phase 7; needs `pnpm dev` (web + worker), Mailpit and the seeded DB
pnpm perf                                     # 50k-item benchmarks on the test DB (items ~40 s, analytics ~3 min; PERF_FILE=… for one)
pnpm db:drift                                 # schema vs migrations must be empty
```

CI (`.github/workflows/ci.yml`):

- It runs typecheck, lint (including `prettier --check`), Vitest, the drift check, `pnpm build` and the Playwright suite against a freshly seeded database, with Mailpit as a service and the worker running in the background (the intake e2e reads confirmation emails).
- On `main` it also builds and pushes the Docker images to GHCR.
- Newer pushes cancel older runs.
- **Last verified:** `main` at `53d5d48` passed every job, images included. Later pushes fixed two timing flakes on CI's cold dev server (D-106). The Phase 6 merge passed typecheck, lint, 254 Vitest tests, the drift check and the full Playwright suite (40 tests + setup) locally before it was pushed; check its CI run first thing. Image builds take over 10 minutes (multi-arch), and newer pushes cancel them, so a quick series of pushes to `main` never finishes one; confirm a completed image build before deploying.
- Check its result before calling a phase done: `gh api repos/d1ff1cult0/dopl/actions/runs --jq '.workflow_runs[:3][] | "\(.status) \(.conclusion) \(.head_sha[:7])"'`.

---

## 4. Code map

```
apps/web/src
  app/(auth)/…                 sign-in, 2FA, reset password, invite acceptance
  app/(public)/f/[slug]        public intake form (cached; ?embed=1 / ?embed=modal)
  app/(public)/s/[token]       contact status page
  app/embed.js                 floating "Feedback" button script
  app/api/public/…             form submit + uploads, status-page replies/uploads/files (rate-limited)
  app/(app)/[ws]/…             home (My Work), notes (+ todos, review), analytics, inbox, messages, mail, projects, p/[ident]/items|views|settings|intake(/forms), views,
                               i/[ref], requests (guests), contacts, settings (… integrations, notifications, mailboxes)
  app/api/auth/[...all]        Better Auth
  app/api/v1/[ws]/…            internal JSON reads for TanStack Query (D-054), /realtime (SSE), channels/[id]/typing
  server/
    services/                  every write: zod → policy → withMutation (Activity + realtime outbox + webhooks)
                               intake (triage), public-intake (forms, status page), intake-forms, contacts, webhooks,
                               inbox (notifications, preferences), channels + messages (chat), notes (+ tags, to-dos, review), dashboards,
                               mail (mailboxes, threads, notes, promote/link, replies)
    intake/core.ts             creating triage items, notifying triagers and submitters, status links
    rate-limit.ts              Postgres fixed-window counters + client IP
    queries/                   reads: work-items (lists, detail), filters (AST → Prisma), views, palette, workspace-items
    actions/                   thin server actions over services, return ActionResult
    realtime/                  LISTEN hub (stored + dopl_ephemeral) + per-connection topic access (D-063, D-085)
    mutation.ts, session.ts, auth.ts, api.ts
  features/
    mail/                      mail view, thread reader + composer, sandboxed email frame, presence, mailbox settings,
                               item-timeline entries
    intake/                    triage queue + bar, request panel, form builder, public form, request thread, contacts
    inbox/                     list + reader, filters, bulk actions, badge
    analytics/                 chart view (Recharts), widget card + states, dashboards (built-in, custom, dnd), builder
    notes/                     grid, card (memoized), editor (#tags, task block ids), capture + Q dialog, sidebar + tag
                               tree, to-dos, review, convert dialog, sharing, item notes + timeline entry, data hooks
    messages/                  channel list, conversation, composer, threads, typing, create-item-from-message
    work-items/                list, board (+ swimlanes), table, calendar, timeline, peek/detail, pickers, data hooks
    filters/                   builder + chip bar
    views/                     save dialog, view menu, views list
    palette/                   "current item" store for ⌘K
    realtime/                  SharedEventSource (leader tab, D-086) + provider (query invalidation)
  components/                  ui primitives (re-themed Radix), shell (sidebar, header, palette, shortcuts overlay), editor (Tiptap)
  lib/shortcuts/registry.ts    the one shortcut registry (D-068)
packages/shared/src            zod schemas (work-item, view, filters, intake, webhooks…), policy, dates, sort keys,
                               rich text, Discord renderer, secret box, email templates
packages/server                server-only code for web and worker: storage, notify (Inbox notifications), webhooks (dispatch)
packages/db                    schema.prisma (all phases), migrations, client, seed (+ seed/intake.ts, seed/mail.ts), bootstrap
apps/worker                    pg-boss: email.send, email.digest, webhook.deliver, snooze.wake, maintenance.prune, analytics.snapshot,
                               gmail.* (src/gmail: Google and fake clients, sync, ingest, sanitize, Pub/Sub pull, send)
```

Patterns to follow (details in `CLAUDE.md`):

- **Writes** go through a service inside `withMutation`, which writes the Activity and realtime rows in the same transaction.
- **Authorization** is decided only in `@dopl/shared/policy`.
- **Client data** comes from TanStack Query with optimistic updates. The cache keys live in `features/work-items/data.ts`, and realtime invalidates them.
- **Every UI string** is in `apps/web/messages/en.json`, and every colour is a token.

---

### Recipes for common changes

- **A new mutation:**
  1. Add a zod schema in `packages/shared/src/schemas/`.
  2. Add a service function in `apps/web/src/server/services/`: parse the input, check the policy, then run the change in `withMutation`, calling `m.activity(…)` and `m.emit({ topic, type, payload })`.
  3. Add a thin action in `server/actions/`.
  4. Add a TanStack mutation hook with an optimistic patch (`features/work-items/data.ts` shows the pattern).
  5. Write an integration test next to the service, using `server/testing/fixtures.ts`.
- **A new read for the client:**
  1. Add a query in `server/queries/`.
  2. Add a route under `app/api/v1/[ws]/…` wrapped in `api(ws, fn)` (401/403/404 mapping, 2FA gate).
  3. Run `npx next typegen`.
  4. Add a `useQuery` hook.
- **A new filter field:**
  1. Add it to `FILTER_FIELDS` (and `validateRule` if it needs a special value) in `packages/shared/src/schemas/filters.ts`.
  2. Compile it in `server/queries/filters.ts`.
  3. Add labels under `filters.field` in `en.json`.
  4. Add a case to `filters.test.ts`; its guard test counts the field × operator pairs and fails until you do.
- **A new shortcut:**
  1. Add it to `lib/shortcuts/registry.ts`.
  2. Label it under `shortcuts.label` in `en.json`.
  3. Handle it where its scope lives. The registry test checks for conflicts and missing labels.
- **A notification:** call `notify(m, { recipientIds, type, entityType, entityId, groupKey?, data })` inside the mutation. Never insert `notifications` rows directly; the helper applies preferences, collapses repeats and emits the badge event. Jobs use `notifyFromJob` in `apps/worker/src/realtime.ts`.
- **A Discord event:** call `m.webhook({ event, entityType, entityId, projectId, detail })` inside the mutation, add the key to `WEBHOOK_EVENTS` (and `AVAILABLE_WEBHOOK_EVENTS` when it's ready for the UI) and a label under `integrations.event` (dots become underscores). Rendering happens in `packages/shared/src/domain/discord.ts` and `apps/worker/src/jobs/webhooks.ts` (`loadEntity`).
- **A public endpoint:** a route under `app/api/public/…` calling a service that returns `PublicResult`; respond with `respond()` from `server/public/respond.ts`, refuse `foreignOrigin(req)`, rate-limit with `hitRateLimit`, and never return internal fields. Mutations without a session use `withPublicMutation`.
- **A new realtime event:** emit it inside `withMutation` on the right topic (`project:`, `workspace:`, `workItem:`, `user:`), then map it to query invalidations in `features/realtime/realtime-provider.tsx`. Access filtering is in `server/realtime/access.ts`.
- **A new screen:**
  1. Put the page under `app/(app)/[ws]/…` with a `Suspense` skeleton.
  2. Put strings in `en.json` and use tokens only.
  3. Take a screenshot with Playwright and compare it with `docs/design/spott-reference.png`.

### Environment

`.env.example` lists and explains every variable. In use today:

- `DATABASE_URL`, `DATABASE_URL_TEST`
- `APP_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `DOPL_ENCRYPTION_KEY`
- `SMTP_*`, `MAIL_FROM`
- `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR` (or the S3 variables)
- optional `GOOGLE_CLIENT_ID`/`SECRET`

- `GMAIL_FAKE_DIR` (dev and CI only: the fake Gmail's directory, relative to the repo root)

The worker's secrets (`GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_SUBSCRIPTION`, later `AGENT_SSH_KEY_FILE`) go in `worker.env`, never `.env` (D-110). The Turnstile, embeddings, Hermes and Warpgate variables belong to later phases.

## 5. Gotchas learned the hard way

- **Prisma refuses `migrate reset` when run by an AI agent.** Don't work around it. Tests use `migrate deploy` plus a separate workspace per test (D-061).
- **Don't build the Docker images locally.** It crashed OrbStack twice; CI builds them. A local `pnpm build` is fine.
- **After adding a route**, run `npx next typegen` in `apps/web` or `PageProps` and `RouteContext` won't typecheck.
- **After `pnpm add` in `apps/web`**, restart the dev server and delete `apps/web/.next/dev` (stale Turbopack modules).
- **Next keeps the previous route mounted but hidden**, so a test id can match twice. In Playwright, use `.filter({ visible: true })`.
- **Don't use `networkidle` in tests.** The realtime SSE stream never idles; wait for `html:not([data-saving])` instead (D-070).
- **`.gitignore` patterns without a leading `/` match at any depth.** `storage/` once hid `apps/web/src/server/storage/` from git.
- **`apps/web` uses ESLint 9 and the packages use ESLint 10** (D-058). pnpm stays on 10 (D-057). Prisma stays on 7 (D-049).
- **The e2e setup empties the "E2E sandbox" project** on every run, so don't keep anything there. It also makes the guest a member of the sandbox.
- **next-intl message keys can't contain dots** (it throws at runtime, not at typecheck).
- **e2e clicks can land before hydration** on server-rendered pages. Use a retry (`clickUntil` in `e2e/intake.spec.ts`), and assert on the saved element, not on text that is still in an input or editor.
- **Chrome blocks a page it considers public from loading scripts on localhost** (Local Network Access). Cross-origin embed tests serve the host page from a real loopback server (`127.0.0.1:4599`), not `page.route`.
- **Playwright's expected Chromium may not be installed** in cloud containers; set `PW_CHROMIUM=/opt/pw-browsers/chromium`.
- **The test database needs the pg-boss queues** (services enqueue in-transaction); `test/global-setup.ts` installs them.
- **ProseMirror attrs are null-prototype objects.** Send editor JSON to server actions only after a plain-JSON round trip; `RichTextEditor`'s `onChange` already does this (D-091).
- **The realtime hub is a `globalThis` singleton** (`__doplRealtime`), so `next dev` hot reload keeps the old one. Restart the dev server after changing `server/realtime/`.
- **Wait for the realtime stream before triggering events from another browser:** `await expect(page.locator("html[data-realtime=open]")).toBeAttached()`. A follower tab shows `relay`.
- **`next dev` compiles a route on its first request**, which can take several seconds, and CI's e2e runs against a cold dev server. Tests that time a realtime update (an event, then a refetch) need that route compiled first. `e2e/global.setup.ts` warms the inbox and chat routes; add any new route that a timed check refetches.
- **Don't `pkill -f "pnpm dev"`** from an agent shell: the pattern matches the shell's own command line and kills it. Kill by PID, or use `pgrep -f "[n]ext dev"`.
- **This dev machine's :3000 belongs to another app.** Run Dopl on another port: `PORT=3100 pnpm dev` with `APP_URL`/`BETTER_AUTH_URL` set to `http://localhost:3100` in `.env`, and `E2E_BASE_URL=http://localhost:3100 pnpm e2e`. The worker's health port is `WORKER_HEALTH_PORT=3101`.
- **Tiptap node views drop `renderHTML` attributes.** TaskItem's node view copies only `HTMLAttributes` onto the `<li>`, so styles keyed on `data-type` need it set there (D-098).
- **Esc inside an editor** can be prevented before React's `onKeyDown` sees it. Handle editor keys in ProseMirror's `editorProps.handleKeyDown`.
- **TanStack structural sharing matches arrays by index.** Inserting at the top of a cached list rebuilds every row object and defeats `memo`. Lists where rows move use an id-based `structuralSharing` (D-095).
- **Popovers inside dialogs** work since D-092 (same z layer). Don't give a popover a higher layer than dialogs; the open order does the stacking.
- **Relative times** need `suppressHydrationWarning` on their element; server and client can straddle a minute.
- **Timed e2e checks need a warm-up** on CI's cold dev server: send one untimed message or capture first, then time the next (D-106). Don't loosen the thresholds.
- **Chart colours are tokens** (`--color-chart-1…8`, D-099). Use `features/analytics/colors.ts` so colour follows the entity; don't pick colours by index for entities.
- **Mail e2e needs the worker** running with the same `GMAIL_FAKE_DIR` as the specs (they read it from `.env`). After `pnpm db:seed`, the mailbox is `CONNECTING` until the worker's next 5-minute poll; restart the worker to connect it at once.
- **Email HTML can't be measured or scripted** in its frame (D-028, D-109). Don't add `allow-same-origin` or `allow-scripts` to fix a layout issue; the e2e test fails if you do.
- **Admins must enrol 2FA before they see admin pages.** For quick admin screenshots in dev, set Bram's role to ADMIN and `users."twoFactorEnabled"` to true in the dev DB, then set both back (or use the magic-link workaround in §2).
- **Background agents in worktrees** (`.claude/worktrees/`, git- and prettier-ignored) work well if each gets its own databases (`CREATE DATABASE dopl_pN`), its own `.env` and its own ports.

---

## 6. Known gaps and open questions

Carried forward (also ticked off in ROADMAP as they get done):

- Playwright visual baselines, an axe check on `/dev/ui`, and a lint rule against raw hex values (from Phase 1).
- The SSO sign-in flow isn't tested end to end against a mock OIDC provider. Registering providers works.
- Unfiltered lists above about 3,000 rows exceed the 50 ms target: they take 40–70 ms (D-062).
- Realtime: changed fields don't flash yet.
- Shortcuts without handlers: `T`, `E`, `M` (peek), `[`. Creating items from a cross-project view isn't possible yet.
- Moved items' old identifiers don't redirect (Q-23).
- Phase 3 carry-overs (ROADMAP): email-to-intake, deleting bytes of abandoned uploads, Turnstile verified with real keys. (Contact pages list email threads since Phase 7.)
- Phase 4 carry-overs (ROADMAP): per-channel mute, per-project notification preferences in the UI, `DUE_SOON` notifications, chat search and image previews, a chat seed, mobile screenshots, agent replies in DMs (Phase 8).
- Phase 5 carry-overs (ROADMAP): 5b (Q-6), the mobile layout of Home's "Assigned to me" rows, and relative times on older screens that can mismatch at hydration.
- Phase 6 carry-overs (ROADMAP): email metrics (the data exists now), keyboard reorder for a lone last-row widget, project-scoped dashboards on the project page, dark-mode chart colours.

- Phase 7 carry-overs (ROADMAP): Gmail label mirroring, loading remote images (needs an image proxy), inline `cid:` images, email-to-intake, email metrics, and a test against a real mailbox.

Open questions for the user are in `docs/OPEN_QUESTIONS.md`. The ones that block upcoming work:

- **Q-21:** which SSO identity provider.
- **Q-6:** the embeddings endpoint, model and dimensions (Phase 5b).
- **Q-17, Q-18:** Warpgate and model details (Phase 8).
- **Q-20 (and Q-16):** who sets up the Google Cloud pieces (OAuth, service account, Pub/Sub) and which mailbox, to connect a real mailbox.
- **Q-25 to Q-29** (chat, notification and shared-note defaults) don't block anything, but are worth a quick answer during the Phase 4 and 5 reviews.

---

## 7. Next steps

1. Show the owner the Phase 3 to 7 screenshots and fix what they flag.
2. Connect the real mailbox once Q-20 is answered: follow `docs/ops/gmail-setup.md`, then watch the status page and the sync log. Only `GoogleGmail` (`apps/worker/src/gmail/client.ts`) hasn't run against Google yet.
3. Then **Phase 8: AI teammate** (untrusted-content rules: items with `untrusted = true` taint runs, D-033). **Phase 5b** (embeddings) whenever Q-6 is answered.
4. Keep the phase routine:
   - Build in small commits.
   - Take screenshots into `docs/screenshots/phase-N/`.
   - Add a CHANGELOG entry, a ROADMAP status block and DECISIONS entries (next free number: see the end of `docs/DECISIONS.md`).
   - Update this handoff.
   - Stop for review.

## 8. Working with the user

- **Never add `Co-Authored-By: Claude`** or any other AI attribution to commits or PRs.
- **Pushing to `main` is fine**; they asked for it.
- **Mind the budget:** the owner pays per session. Prefer targeted checks over repeated full screenshot passes, and don't start parallel agents unless asked.
- **Stop after each phase** and show the screenshots.
- **Match the Spott reference's feel and the Dopl colours.** Plane and Blinko are inspiration only: never copy their code, schemas, styles or assets.
