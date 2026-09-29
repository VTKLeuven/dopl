# Dopl: handoff

Where the project stands and how to pick it up. Updated 2026-09-29, after Phases 3–4. If you're a new Claude Code session: read this first, then `CLAUDE.md` (conventions and version gotchas), then the relevant part of `docs/ROADMAP.md`.

**To start a new session**, open Claude Code in the repo and paste:

> Read `docs/HANDOFF.md`, then `CLAUDE.md` and `PROMPT.md`. Start the dev services (`pnpm db:up`, then `pnpm dev` in the background), check that `pnpm typecheck && pnpm test` pass and what CI says about the latest commit on `main`, and summarise where the project stands. Then build Phase 5 (ROADMAP §Phase 5), starting from the unfinished work on the `wip/phase-5-notes` branch (HANDOFF §1.2), and stop for my review when it's done.

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
| 5 Notes & My Work | **next**, WIP branch (§1.2)   | Quick capture, notes grid, tags, to-dos, sharing, daily review, Home / My Work                   |
| 6–8               | planned                       | Analytics · Shared mailbox · AI teammate                                                         |

- **What each phase delivered:** `docs/CHANGELOG.md`.
- **What's left over from each phase:** the unticked boxes under each phase in `docs/ROADMAP.md`.
- **Screenshots:** `docs/screenshots/phase-1/` to `docs/screenshots/phase-4/`.

**The owner approved Phases 1 and 2** and asked for 3 and 4 in one go. Both are built and merged; their reviews are still pending, so show the screenshots in `docs/screenshots/phase-3/` and `docs/screenshots/phase-4/` at the start of the next session. Phase 5 was started in parallel and stopped halfway (budget); its work is on the `wip/phase-5-notes` branch, not on `main` (§1.2).

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

### 1.2 Phase 5: unfinished work on `wip/phase-5-notes`

A background agent started Phase 5 in parallel and was stopped halfway to save budget. Its two commits are pushed to **`wip/phase-5-notes`** (not merged). Build on them rather than starting over.

- **Base:** `5c43e89` (the Phase 2 handoff), so the branch predates Phases 3 and 4.
- **`e282188` Add the notes domain (solid):**
  - `packages/shared/src/domain/notes.ts`: inline `#tag` parsing (nested, lowercased, parents implicit), tag rename/delete rewriting, stable task `blockId`s, the `NoteTodo` projection, marking a converted line, the 1-3-7-21-60 review schedule with a deterministic weighted daily pick.
  - `packages/shared/src/schemas/notes.ts` and `canNote` in the policy module.
  - `server/services/notes.ts`: create, update, archive, trash and purge notes; toggle to-dos and set due dates; convert a line or a note into a work item with a `CREATED_FROM` reference; daily review actions; tag rename, merge and delete. Every write runs in `withMutation`.
  - `server/queries/notes.ts` and routes under `/api/v1/[ws]/notes` (grid, one note, tags, to-dos, review, summary, search), plus `server/actions/notes.ts`.
  - Tests: `domain/notes.test.ts`, `policy/notes.test.ts`, `services/notes.test.ts`.
- **`5736494` WIP UI (unverified):** `/[ws]/notes` (grid, sidebar with tags, editor, quick capture, convert dialog), `/[ws]/notes/todos`, `/[ws]/notes/review`, Home widgets, notes in the ⌘K palette, the realtime hookup and about 270 `en.json` strings. **Nothing in this commit was typechecked, linted, tested or looked at.** Expect bugs.

**How to pick it up:**

1. Branch from `main` and merge the WIP into it:

   ```bash
   git checkout -b claude/phase-5 origin/main
   git merge origin/wip/phase-5-notes
   ```

   Five files conflict, all small and additive: `components/shell/global-shortcuts.tsx`, `components/shell/sidebar.tsx`, `features/realtime/realtime-provider.tsx`, `features/work-items/item-detail.tsx` and `server/services/work-items.ts`. Keep both sides. `en.json`, the shortcut registry and the policy module merge cleanly.

2. Adapt the notes code to what Phases 3–4 changed:
   - `withMutation` now hands the callback `m` with `m.webhook`, and `MutationActor` has a `type`.
   - Notifications go through `notify()`.
   - The sidebar has Inbox and Messages entries and new props (`intakePending`, `showRequests`, `showContacts`, `canChat`).
   - The realtime provider uses `SharedEventSource`. Specs should wait on `<html data-realtime>`.
   - Home may already read the Inbox summary for its notifications widget.
3. Run `pnpm typecheck && pnpm lint && pnpm test`, then go screen by screen: fix, screenshot, compare with the Spott reference, and add e2e specs for the Phase 5 acceptance list.
4. Phase 5b (embeddings, semantic search) still waits on Q-6.

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
pnpm db:seed                  # workspace "VTK IT" at /vtk, 5 projects, ~300 items
pnpm dev                      # web on :3000 + worker (email, webhooks, snooze wake-ups, maintenance)
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

Phase 3 seed data: the HELP project has a published form at <http://localhost:3000/f/it-support>, a draft form on INFRA, seven contacts (one blocked) and twelve requests in every triage state (`/vtk/p/HELP/intake`).

**Admin screens without 2FA in dev:** seeded admins use passwords, so they must enrol TOTP first. To look at admin-only pages quickly, delete the admin's credential row in the dev DB and sign in with a magic link from Mailpit (`DELETE FROM accounts a USING users u WHERE a."userId" = u.id AND u.email = 'ann@dopl.test' AND a."providerId" = 'credential';`). `pnpm db:seed` puts the password back.

---

## 3. Checks

```bash
pnpm typecheck && pnpm lint && pnpm test     # 192 Vitest tests after Phase 4; integration tests use DATABASE_URL_TEST
pnpm e2e                                      # 31 Playwright tests + setup after Phase 4; needs `pnpm dev` (web + worker), Mailpit and the seeded DB
pnpm perf                                     # 50k-item benchmark on the test DB (~40 s, not in CI)
pnpm db:drift                                 # schema vs migrations must be empty
```

CI (`.github/workflows/ci.yml`):

- It runs typecheck, lint (including `prettier --check`), Vitest, the drift check, `pnpm build` and the Playwright suite against a freshly seeded database, with Mailpit as a service and the worker running in the background (the intake e2e reads confirmation emails).
- On `main` it also builds and pushes the Docker images to GHCR.
- Newer pushes cancel older runs.
- **Last verified:** CI_STATUS_PLACEHOLDER Image builds take over 10 minutes (multi-arch), and newer pushes cancel them, so a quick series of pushes to `main` never finishes one; confirm a completed image build before deploying.
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
  app/(app)/[ws]/…             home, inbox, messages, projects, p/[ident]/items|views|settings|intake(/forms), views,
                               i/[ref], requests (guests), contacts, settings (… integrations, notifications)
  app/api/auth/[...all]        Better Auth
  app/api/v1/[ws]/…            internal JSON reads for TanStack Query (D-054), /realtime (SSE), channels/[id]/typing
  server/
    services/                  every write: zod → policy → withMutation (Activity + realtime outbox + webhooks)
                               intake (triage), public-intake (forms, status page), intake-forms, contacts, webhooks,
                               inbox (notifications, preferences), channels + messages (chat)
    intake/core.ts             creating triage items, notifying triagers and submitters, status links
    notifications/notify.ts    the one way to create Inbox notifications (prefs, grouping, realtime)
    webhooks/dispatch.ts       matches events to webhooks, coalesces, enqueues webhook.deliver
    rate-limit.ts              Postgres fixed-window counters + client IP
    queries/                   reads: work-items (lists, detail), filters (AST → Prisma), views, palette, workspace-items
    actions/                   thin server actions over services, return ActionResult
    realtime/                  LISTEN hub (stored + dopl_ephemeral) + per-connection topic access (D-063, D-085)
    mutation.ts, session.ts, auth.ts, api.ts
  features/
    intake/                    triage queue + bar, request panel, form builder, public form, request thread, contacts
    inbox/                     list + reader, filters, bulk actions, badge
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
packages/db                    schema.prisma (all phases), migrations, client, seed (+ seed/intake.ts), bootstrap
apps/worker                    pg-boss: email.send, email.digest, webhook.deliver, snooze.wake, maintenance.prune
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

The Gmail, Turnstile, embeddings, Hermes and Warpgate variables belong to later phases.

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
- Phase 3 carry-overs (ROADMAP): email-to-intake (needs Phase 7), deleting bytes of abandoned uploads, Turnstile verified with real keys, contact pages listing email threads.
- Phase 4 carry-overs (ROADMAP): per-channel mute, per-project notification preferences in the UI, `DUE_SOON` notifications, chat search and image previews, a chat seed, mobile screenshots, agent replies in DMs (Phase 8).

Open questions for the user are in `docs/OPEN_QUESTIONS.md`. The ones that block upcoming work:

- **Q-21:** which SSO identity provider.
- **Q-6:** the embeddings endpoint, model and dimensions (Phase 5b).
- **Q-20:** who sets up the Google Cloud pieces (OAuth, service account, Pub/Sub).
- **Q-16, Q-17, Q-18:** mailbox, Warpgate and model details (Phases 7–8).
- **Q-25 to Q-28** (chat and notification defaults) don't block anything, but are worth a quick answer during the Phase 4 review.

---

## 7. Next steps

1. Show the owner the Phase 3 and Phase 4 screenshots and fix what they flag.
2. **Phase 5: Notes & My Work** (ROADMAP §Phase 5). **Start from `wip/phase-5-notes`** (§1.2): the domain, services, queries and tests exist; the UI is drafted but unverified. Follow DATA_MODEL §3.5 and D-022 (to-dos are a projection keyed by the task node's `blockId`, which the rich-text sanitizer already allows). Home (`/vtk/home`) gets rebuilt as My Work, and its notifications summary can read the Inbox. 5b (embeddings, semantic search) waits on Q-6.
3. **Phase 6: Analytics**, then **Phase 7: Shared mailbox** (also unlocks email-to-intake and mail events for Discord: `email_thread.created`, `email_message.received` are already defined in `WEBHOOK_EVENTS`), then **Phase 8: AI teammate** (untrusted-content rules: items with `untrusted = true` taint runs, D-033).
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
