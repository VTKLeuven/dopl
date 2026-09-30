# Dopl: handoff

Where the project stands and how to pick it up. Updated 2026-09-29, after Phase 8. If you're a new Claude Code session: read this first, then `CLAUDE.md` (conventions and version gotchas), then the relevant part of `docs/ROADMAP.md`.

**To start a new session**, open Claude Code in the repo and paste:

> Read `docs/HANDOFF.md`, then `CLAUDE.md` and `PROMPT.md`. Start the dev services (`pnpm db:up`, then `pnpm dev` in the background), check that `pnpm typecheck && pnpm test` pass and what CI says about the latest commit on `main`, and summarise where the project stands. Then continue with what §1.0 and §7 list and stop for my review after each step.

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
| 8 AI teammate     | ✅ built, **awaiting review** | Hermes runs, MCP tools, `infra_exec` with approvals, taint, Pause/Stop, audit log                |

- **What each phase delivered:** `docs/CHANGELOG.md`.
- **What's left over from each phase:** the unticked boxes under each phase in `docs/ROADMAP.md`.
- **Screenshots:** `docs/screenshots/phase-1/` to `docs/screenshots/phase-8/`.

**The owner approved Phases 1 and 2** and asked for 3 and 4 in one go. Phases 3 to 8 are built and merged (the owner asked for Phases 6, 7 and 8 right after the one before, and then for 5b and the carry-overs); their reviews are still pending, so show the screenshots in `docs/screenshots/phase-3/` to `docs/screenshots/phase-8/` at the start of the next session.

Everything is committed and pushed to `main` on `github.com/VTKLeuven/dopl`. The dev workspace slug is `vtk` (URLs look like `/vtk/p/INFRA/items`).

### 1.0 Going live (read this first)

**Dopl is ready to deploy.** The production stack was run end to end on 2026-09-30 from a fresh `git clone` with the published images of `52747bb` (and before that with the older ones): migrations, `./dopl bootstrap`, accepting the owner invite, forced 2FA enrolment, a project, an item with an attachment (upload and download), an invite email over SMTP, a backup, a restore (data and uploads back, audit trigger intact) a 2FA reset and the `./dopl` commands. Backup files are root-only (`umask 077`). `docs/ops/deploy.md` is the guide; `README.md` has the short version; D-125 records the choices.

**To go live, the owner does:**

1. A server with Docker and the compose plugin, DNS `dopl.vtk.be` → the server.
2. `git clone https://github.com/VTKLeuven/dopl.git /opt/dopl`, `cp .env.production.example .env`, generate the secrets and fill in the domain and SMTP (deploy.md §2). Keep a copy of `.env` in a password manager.
3. **SMTP:** allow the server's IP in the Google Workspace SMTP relay (or use SMTP AUTH). Without working email nobody can join (invite-only).
4. HTTPS: `DOPL_CADDY=true`, or the existing reverse proxy with the two unbuffered SSE paths (deploy.md §4).
5. `./dopl up`, `./dopl bootstrap you@vtk.be "Name"`, open the link, set a password and 2FA, invite the team.
6. Copy `docker/backups/` off the server nightly with existing tooling, and do one test restore on a spare machine.

**After it's live, in this order:**

1. **Use it for a week or two** with the team (projects, items, intake forms, chat, notes). Collect what's missing or annoying; that's the review of Phases 3–8 the owner still owes.
2. **Updates are automatic:** every push to `main` that passes CI is deployed by `.github/workflows/deploy.yml` (`./dopl deploy <sha>` over SSH, pinned to the commit; D-130). It needs the one-time key and secrets from deploy.md §7. Roll back from Actions → Deploy → Run workflow with an older SHA.
3. **Google Cloud (Q-20):** one project with an OAuth client (Google sign-in) and a service account with domain-wide delegation plus Pub/Sub (the shared mailbox). Then connect `it@vtk.be` following `docs/ops/gmail-setup.md` (Q-16). Only `GoogleGmail` itself hasn't run against Google yet.
4. **AI teammate:** deploy Hermes with Qwen 3.8 27B, create the Warpgate user and key, fill in `worker.env`, then Settings → AI teammate (Check connection, hosts, rules, MCP token) following `docs/ops/agent-setup.md`. Start with a lab host only. The adapter has only run against the fake Hermes.
5. **SSO (Q-21)** once the identity provider is chosen; **Phase 5b** (semantic search) once Q-6 is answered.
6. The carry-overs in §6 and the ROADMAP, by what the team asks for.

**Fixed flake:** `e2e/messages.spec.ts` ("two people: live messages…") used to time live delivery from the keypress with 2–3 s budgets that CI's cold dev server missed (it failed `ca0cfaa` and `45bd0f5`). It now waits for the commit, asserts the message arrives through realtime without a reload, and records the latency as an annotation instead of failing on it (D-126). The 1 s acceptance bar is only measurable against a production build; running CI's e2e that way needs a test-only sign-in rate-limit allowance first (D-114).

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

### 1.5 Phase 8 status

Phase 8 was built on `claude/phase-8` and merged into `main`.

- **What's in it:** @Dopl in comments and chat, DMs and assignment start runs; the worker drives Hermes' Runs API; Dopl's MCP server at `/api/mcp`; `infra_exec` over SSH via Warpgate with the host allowlist, read-only/DENY rules and approvals; taint tracking; Stop and Pause; run cards on item timelines, in chat and in the Inbox; the Dopl page (`/vtk/agent`); Settings → AI teammate and Audit log; "Approves Dopl" in Members. Details are in `docs/CHANGELOG.md`; decisions are D-115 to D-124; carry-overs are unticked under Phase 8 in `docs/ROADMAP.md`; the real setup is `docs/ops/agent-setup.md`.
- **No real Hermes or Warpgate yet.** Dev and CI use the worker's fake Hermes and fake executor (D-121): `.env` has `HERMES_FAKE_PORT=8643`, `HERMES_FAKE_MCP_TOKEN=…` and `AGENT_EXEC_FAKE=true`, and `pnpm db:seed` points the agent at the fake and registers the token. Ask the fake things like "run \`uptime\` on lab-01", "read the email", "list hosts" (see the file's header).
- **No migrations.** **New env:** worker.env gets `HERMES_API_KEY`, `WARPGATE_HOST`, `WARPGATE_PORT`, `WARPGATE_HOST_KEY`, `AGENT_SSH_USER`, `AGENT_SSH_KEY_FILE`, `AGENT_EXEC_TIMEOUT_SEC`. **New queues:** `agent.run`, `agent.exec` (never retried), `agent.runtime-approval`, `agent.stop`, `agent.check`, `agent.reconcile` (every minute). **New dependencies:** `@modelcontextprotocol/sdk` (web, worker), `ssh2` (worker).
- **Seed:** the agent's profile (on), three hosts (`lab-01`, `staging-01`, `app-01` production), 13 default rules, and Bram may approve (so the e2e tests can). It also runs on an already-seeded database.
- **Screenshots:** `docs/screenshots/phase-8/` (12, including phone width).
- **Deployment:** add `/api/mcp` to Caddy's unbuffered block (see `docs/ops/agent-setup.md` §1).

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
- **Q-7, Q-17, Q-18 answered (defaults):** Hermes' own terminal tools off; one Warpgate user `dopl-agent` with key auth and per-target roles; Qwen 3.8 27B with a 128k context (D-115 to D-124).
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
pnpm typecheck && pnpm lint && pnpm test     # 328 Vitest tests after Phase 8; integration tests use DATABASE_URL_TEST
pnpm e2e                                      # 50 Playwright tests + setup after Phase 8; needs `pnpm dev` (web + worker with the dev fakes), Mailpit and the seeded DB
pnpm perf                                     # 50k-item benchmarks on the test DB (items ~40 s, analytics ~3 min; PERF_FILE=… for one)
pnpm db:drift                                 # schema vs migrations must be empty
```

CI (`.github/workflows/ci.yml`):

- It runs typecheck, lint (including `prettier --check`), Vitest, the drift check, `pnpm build` and the Playwright suite against a freshly seeded database, with Mailpit as a service and the worker running in the background (the intake e2e reads confirmation emails).
- On `main` it also builds and pushes the Docker images to GHCR.
- Newer pushes cancel older runs.
- **Last verified:** `main` at `953a21a` (Phase 7 plus a Dockerfile fix) passed every job, images included. The Phase 7 merge itself (`5f62421`) passed the checks but failed the image build, because the Dockerfile didn't install the new `@dopl/server` package; `deploy.test.ts` now checks that every workspace package is installed there. From `46b88a3` to the Phase 6 merge, CI's e2e step failed on a different timing-sensitive test each run (the cold dev server); Playwright now retries once on CI, and a pass on retry shows as flaky (D-114). Locally the note-capture timing check exceeds 100 ms only while this machine is swapping. Image builds take over 10 minutes (multi-arch), and newer pushes cancel them, so a quick series of pushes to `main` never finishes one; confirm a completed image build before deploying.
- Check its result before calling a phase done: `gh api repos/VTKLeuven/dopl/actions/runs --jq '.workflow_runs[:3][] | "\(.status) \(.conclusion) \(.head_sha[:7])"'`.

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
  app/api/v1/[ws]/…            internal JSON reads for TanStack Query (D-054), /realtime (SSE), channels/[id]/typing, agent, audit (+ export)
  app/api/mcp                  Dopl's MCP server for the AI teammate (bearer MCP token + per-run run_token, D-032)
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
    agent/                     runs (queue + trusted context), mcp (tools), mcp-auth, infra (infra_exec/wait), approvals, wait
    mutation.ts, session.ts, auth.ts, api.ts
  features/
    agent/                     run cards + steps, approval cards, Dopl page, run page, active runs in chat, settings, audit log
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
packages/server                server-only code for web and worker: storage, notify (Inbox notifications), webhooks (dispatch), agent (steps, cancel)
packages/db                    schema.prisma (all phases), migrations, client, seed (+ seed/intake.ts, seed/mail.ts), bootstrap
apps/worker                    pg-boss: email.send, email.digest, webhook.deliver, snooze.wake, maintenance.prune, analytics.snapshot,
                               gmail.* (src/gmail: Google and fake clients, sync, ingest, sanitize, Pub/Sub pull, send),
                               agent.* (src/agent: HermesRuntime, fake Hermes, Warpgate + fake executor, run loop, reply, reconcile)
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
- optional `SSO_TRUSTED_ORIGINS`: the identity-provider origins an admin may add as SSO (D-127)

- `GMAIL_FAKE_DIR` (dev and CI only: the fake Gmail's directory, relative to the repo root)

The worker's secrets (`GOOGLE_SERVICE_ACCOUNT_KEY_FILE`, `GMAIL_PUBSUB_*`, `HERMES_API_KEY`, `WARPGATE_*`, `AGENT_SSH_*`) go in `worker.env`, never `.env` (D-110). `HERMES_FAKE_PORT`, `HERMES_FAKE_MCP_TOKEN` and `AGENT_EXEC_FAKE` are dev/CI fakes in `.env`.

## 5. Gotchas learned the hard way

- **Prisma refuses `migrate reset` when run by an AI agent.** Don't work around it. Tests use `migrate deploy` plus a separate workspace per test (D-061).
- **Don't build the Docker images locally.** It crashed OrbStack twice; CI builds them. A local `pnpm build` is fine. To test the production stack, run `docker/compose.prod.yml` with the published images in a scratch directory under its own project name and port (`docker compose -p dopl-deploytest …`, `DOPL_PORT=3900`), with a small override that adds `extra_hosts: host.docker.internal:host-gateway` to reach the dev Mailpit.
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
- **A new workspace package** needs its `package.json` copied in `docker/Dockerfile`'s deps stage; `deploy.test.ts` fails until it is.
- **Rich text loses backticks in plain text.** The editor turns \`x\` into inline code, and `docToPlainText` drops the mark. Text for the agent goes through `docToPromptText`; the agent's Markdown answers through `markdownToDoc`.
- **Server pages can't import from `"use client"` modules** (they get a client reference). Query keys shared with server prefetch live in a plain `keys.ts` (`features/agent/keys.ts`, `features/inbox/keys.ts`).
- **The agent e2e needs the worker with the dev fakes**, the same as mail. `apps/web/src/server/agent/agent.test.ts` calls the MCP route handler directly with a real token; set `DOPL_MCP_WAIT_MS` low there.
- **`psql` isn't installed on this machine:** `docker exec -i dopl-dev-postgres-1 psql -U dopl -d dopl`.
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

- Phase 8 carry-overs (ROADMAP): a test against a real Hermes and Warpgate, Discord posts for approvals, approval shortcuts, more than one run at a time.
- Phase 7 carry-overs (ROADMAP): Gmail label mirroring, loading remote images (needs an image proxy), inline `cid:` images, email-to-intake, email metrics, and a test against a real mailbox.

Open questions for the user are in `docs/OPEN_QUESTIONS.md`. The ones that block upcoming work:

- **Q-21:** which SSO identity provider.
- **Q-6:** the embeddings endpoint, model and dimensions (Phase 5b).
- **Q-20 (and Q-16):** who sets up the Google Cloud pieces (OAuth, service account, Pub/Sub) and which mailbox, to connect a real mailbox.
- **Q-25 to Q-29** (chat, notification and shared-note defaults) don't block anything, but are worth a quick answer during the Phase 4 and 5 reviews.

---

## 7. Next steps

0. Deploy and go live (§1.0). Anything the team reports during the first weeks comes before new features.
1. Show the owner the Phase 3 to 8 screenshots and fix what they flag.
2. Connect the real mailbox once Q-20 is answered: follow `docs/ops/gmail-setup.md`, then watch the status page and the sync log. Only `GoogleGmail` (`apps/worker/src/gmail/client.ts`) hasn't run against Google yet.
3. Connect the real Hermes and Warpgate: follow `docs/ops/agent-setup.md`, then Settings → AI teammate → Check connection and a first `uptime` on a lab host.
4. **Phase 5b** (embeddings) and the carry-overs (see the ROADMAP and §6).
5. Keep the phase routine:
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
- **The owner speaks Dutch**; answer in Dutch, keep the code and docs in English.
- **Match the Spott reference's feel and the Dopl colours.** Plane and Blinko are inspiration only: never copy their code, schemas, styles or assets.
