# Dopl: roadmap

Phases follow §6 of the brief. **Every phase ends with a definition of done:**

- `pnpm typecheck`, `pnpm lint` and `pnpm test` all pass. CI is green, including the migration-drift check.
- Playwright smoke tests cover the phase's main flows.
- Screenshots of every new screen are reviewed against `docs/design/spott-reference.png` and saved to `docs/screenshots/phase-N/`.
- `docs/CHANGELOG.md` has an entry. `CLAUDE.md` and the other docs are updated where things changed.
- Then **stop**: show the screenshots, summarize what's done and what's next, and wait for your go-ahead.

Acceptance criteria are written so they can be checked; each one maps to a test or a screenshot where possible.

---

## Phase 0: Foundations & plan ✅ (awaiting approval)

- [x] Research: Plane (work items, states, views, intake, stickies) and Blinko (notes, tags, to-dos, review), used as inspiration only. Next.js 16.3, Prisma 7 (v7 docs), Better Auth, Hermes Agent (programmatic integration, API server, security, MCP) and Gmail API (push, sync) docs.
- [x] `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DESIGN_SYSTEM.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/OPEN_QUESTIONS.md`
- [x] Full `packages/db/prisma/schema.prisma`, validated with Prisma 7.10 and migrated on Postgres 17.11 + pgvector. Spikes confirmed:
  - no drift from `COLLATE "C"`, CHECK constraints, the audit trigger or `search.embeddings`
  - HNSW inside `public` _does_ drift, hence D-017
- [x] Your approval + answers to Q-1…Q-4 (2026-09-29), plus two new requirements: Discord webhooks (D-052) and email+password/SSO sign-in (D-050)

---

## Phase 1: Core

### 1.1 Monorepo scaffold

- The pnpm workspace (`apps/web`, `apps/worker`, `packages/db`, `packages/shared`) with pinned `packageManager` and Node 24 `engines`, and TypeScript 6 strict configs with project references.
- `apps/web` from `create-next-app@16.3`, which writes the Next-managed `AGENTS.md`/`CLAUDE.md` block. The `next.config.ts` flags are per D-005.
- `packages/db`:
  - `prisma.config.ts`, the client with `PrismaPg` and explicit pool settings (D-010), the generated ESM client, and re-exports
  - the init migration, then `*_manual_*` migrations (collations, CHECKs, audit trigger, `search` schema)
- `packages/shared`: zod, uuidv7 helper, fractional keys, query-key factory, and the policy skeleton.
- `apps/worker`: pg-boss 12 boot, schedules registry, `/healthz`, pino logging.
- `docker/compose.dev.yml` (`pgvector/pgvector:pg17`, Garage), a complete and commented `.env.example`, and Dockerfiles for web, worker and migrate.
- Tooling: ESLint 10 flat config (with the restricted-imports and JSX-literal rules), Prettier, Vitest 5 (plus a Postgres test service), Playwright 1.63 (plus `@next/playwright`).
- GitHub Actions: install → typecheck → lint → unit/integration tests → `prisma migrate diff` must be empty → build → e2e smoke → build and push images on `main`.

**Acceptance:**

- A clean clone works with `pnpm i && pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev`, documented in `CLAUDE.md`.
- CI is green. The drift check fails CI when the schema and migrations disagree; this is tested once with a deliberate change.
- A test proves fractional keys order correctly in the database, including keys like `Zz` and `a0`.

### 1.2 Design system foundation

- Tokens in `globals.css` per `DESIGN_SYSTEM.md` §3 and §9. Inter and JetBrains Mono via `next/font`.
- Favicon, apple-touch and PWA icons generated from `assets/brand/dopl-mark.png`. The Dopl logo component.
- Re-themed primitives:
  - Button, SplitButton, Input, Textarea, SearchField
  - Select/Combobox, Checkbox, Radio, Switch, SegmentedControl, Tabs
  - Tooltip (+Kbd), Menu/ContextMenu, Popover, Dialog, Sheet, Toast (sonner)
  - Skeleton, Avatar/AvatarStack/AgentAvatar, Tag pill, Chip, ProgressRing, Banner
  - EmptyState, ErrorState, StateIcon, PriorityIcon, TypeIcon, PropertyPill, DatePicker
- `/dev/ui` shows every component in every state.

**Acceptance:**

- Every §5 component that Phase 1 needs appears on `/dev/ui` in all listed states. Playwright visual baselines are committed.
- No raw hex values outside `globals.css` (lint).
- axe finds no violations on `/dev/ui`.
- Screenshots have been compared to the Spott reference and the differences fixed. The comparison notes are in the phase summary.

### 1.3 App shell

- The canvas, sidebar (logo, search → palette stub, nav, projects, user menu), inset panel, page header (breadcrumb + actions) and toolbar row.
- Responsive drawer below 768 px.
- The static shell plus `<Suspense>` skeletons for session data, following D-005.
- `instant()` tests for Home → Project list and Project → Project.

**Acceptance:**

- Navigating between sidebar destinations shows the new page's shell instantly, with no blank panel and no layout shift. The `instant()` tests pass.
- The shell matches the reference's measurements (§2 of the design system) within ±2 px, checked with an overlay screenshot.

### 1.4 Authentication (invite-only, D-050)

- Better Auth with the Prisma adapter, `generateId: false`, cookie cache, `nextCookies()`, secure cookies and strict auth rate limits (D-051).
- Invites pre-create the user; the `/invite/<token>` acceptance page offers every enabled method. Account linking by verified email.
- **Google** (`disableSignUp`, optional `hd` hint), **email + password** (`disableSignUp`; the invite link doubles as "set password"), **TOTP 2FA** (required for password-based Owners and Admins), **SSO** (`@better-auth/sso`, generic OIDC, `disableImplicitSignUp`, admin-configured) and **magic link** (`disableSignUp`).
- The SSO and 2FA tables are generated with the Better Auth CLI and added to `schema.prisma`.
- `pnpm dopl:bootstrap --email …` creates the workspace, the first Owner and a one-time invite link.
- Emails go through the Mailer: the Workspace SMTP relay in production, logged to the console in dev.
- The sign-in page. `proxy.ts` handles cookie-presence redirects and security headers (D-029 CSP).
- A dev-only e2e credential provider behind `DOPL_E2E=1`, with a build-time guard.
- Audit log entries for sign-in, sign-out, failed domain checks and invites.

**Acceptance:**

- An invited user can accept with Google, a password, SSO (tested against a local mock OIDC IdP) or a magic link, and lands on Home.
- An **uninvited** user is refused by every method, with a generic message and an audit entry. No user row is created.
- A password-based Admin is forced through 2FA enrolment.
- The 6th wrong password within 15 minutes is rate-limited.
- A production build fails if the e2e provider is enabled.

### 1.5 Workspace, projects, members, roles

- The policy module in `@dopl/shared`, with unit tests for every role × action in the ARCHITECTURE §7 matrix, and the server `authorize()` wrapper.
- Workspace settings: general, members (roles, deactivate) and invites (member/guest, with project selection).
- Projects: create (identifier validation, default states including TRIAGE, labels from the palette, types), settings (states CRUD with reassign-on-delete, labels, types, members and roles, visibility, `guestsCanViewProject`), archive and restore.
- The `withMutation` helper: Activity plus a `realtime_events` row in every mutation transaction.

**Acceptance:**

- A policy test matrix covers 100% of actions × roles.
- A guest cannot load any project URL they're not a member of: they get a 404, not a 403, to avoid leaking that it exists. There's an e2e test for this.
- Renaming a project identifier keeps old `#OLD-12` references resolving.

### 1.6 Work items

- Services: create (the sequence counter, a `sortKey` at the end of the group), update every field, sub-items (with cycle check and counters), relations (blocks/blocked by/relates/duplicate), links, attachments (BlobStore `local` + `s3` drivers, presign, confirm), subscribers (auto rules), archive/restore, soft delete/undo.
- The create dialog: all fields, prefilled from the current view's filters, `⌘⇧Enter` create-and-continue, and pasting N lines offers "Create N items".
- Copy link and copy identifier.

**Acceptance:**

- Every mutation writes Activity (tested) and a realtime outbox row (tested).
- Pasting 10 lines creates 10 items in one transaction, with consecutive sequences and one grouped activity batch.
- An attachment over the size limit is rejected at presign time and again on confirm.
- Undoing a delete within 5 s restores the item with the same identifier.

### 1.7 List and board views

- The RSC first page flows into TanStack Query hydration (D-009). Optimistic mutations with rollback.
- **List:**
  - group by state, priority, assignee, label or type
  - order by manual, priority, due, created or updated
  - collapsible groups, virtualized rows, comfortable and compact density
  - inline PropertyPill editing
- **Board:**
  - columns by the group-by field
  - dnd-kit drag within a column (fractional key) and across columns (changes the grouped property; handles many-to-many fields)
  - optional swimlanes
  - keyboard drag
- Basic shortcut registry: `J`/`K`, `Enter`, `X`, `A`, `S`, `P`, `L`, `D`, `C`, `Esc`, with tooltips showing the keys.

**Acceptance:**

- **Done items are hidden by default** in every project view, with a "Done hidden · N" chip and `⇧H` to toggle. The board shows the Done and Cancelled columns collapsed with counts, and the choice survives a reload (D-053, Plane pain point #3).
- Changing a property inline updates list, board and peek instantly (optimistic), even with the network throttled to Slow 3G. A server failure rolls back and shows a toast.
- Dragging a card to another column changes its state and keeps its position after a reload.
- 2,000 items in one project scroll smoothly: no dropped frames in a Playwright trace, and fewer than 60 row DOM nodes are mounted.
- Every shortcut above works and is shown in its tooltip.

### 1.8 Peek panel and detail page

- Peek (`?peek=`) and the full page (`/{ws}/i/INFRA-42`) share the same layout: title, description (Tiptap with `@` mentions and `#` item refs), properties, sub-items, relations, attachments and the timeline (comments + activity).
- Comments: create, edit, delete (undo), reactions and mentions. Mentioned users are subscribed; their notifications are stored now and surfaced in Phase 4.

**Acceptance:**

- Peek opens instantly from a list row using cached data, loads the rest, and `J`/`K` moves between items.
- `#INFRA-4` autocompletes and renders a chip with a hover card. `@ann` autocompletes and stores a mention node.
- Timeline order is stable, and activity lines read naturally ("Ann changed priority from Low to High · 2h").

### 1.9 Seed data

- A deterministic seed per DATA_MODEL §9: about 300 items across 5 projects, members, guests, the agent user, labels, relations, comments and activity.

**Acceptance:** `pnpm db:seed` produces identical data on every run, so screenshots are stable.

### 1.10 Phase 1 wrap-up

- Playwright smoke: sign in → create an item → edit it inline → drag it on the board → open peek → comment → archive and restore.
- Screenshot review against the reference. CHANGELOG entry. **Stop for review.**

---

## Phase 2: Views

1. **Table view:** TanStack Table v9 + Virtual, every cell inline-editable, resizable and reorderable columns (saved per view), a pinned first column, keyboard grid navigation, and sort by header click.
   _Accept:_ 10,000 rows scroll at 60 fps and editing a cell never re-renders other rows (React Profiler check).
2. **Calendar:** month and week views, a due/start date toggle, drag to reschedule (optimistic), and an unscheduled tray you can drag from.
   _Accept:_ rescheduling by keyboard works; items dated outside the grid appear in the "+N" overflow.
3. **Timeline (Gantt):** bars from start to due date, drag to move and resize (with snapping), dependency arrows from BLOCKS relations with conflict colouring, week/month/quarter zoom, a today line, and a virtualized row list.
   _Accept:_ dragging a bar updates both dates atomically; arrows follow bars while dragging.
4. **Display options:** group, sub-group, order, show sub-items, show empty groups, property visibility and density, all persisted in `ViewPreference`.
5. **Filter builder:** the AST editor (rules, AND/OR, nested groups), quick filters, dynamic values (`me`, `today`…), the compiler with a unit test for every field × operator, and URL state via nuqs.
6. **Saved views:** personal and shared; project and workspace (cross-project) views; favourites in the sidebar; "Save as view" from any unsaved state; lock views.
7. **⌘K palette:** navigation, search (trigram) across items, projects and people, every action ("Change priority of INFRA-42 to High"), recents, and nested pages.
8. **Keyboard:** the full registry, a `?` overlay, and hints in menus and tooltips.
9. **Bulk actions:** multi-select (`X`, `⇧`-click, `⌘A`), then a floating action bar (state, priority, assignees, labels, type, move project, archive, delete). One batch, one undo.
10. **Performance pass:** seed 50,000 items and `EXPLAIN ANALYZE` every view query, adding indexes as needed.
    _Accept:_ p95 under 50 ms at 50k items.

> **Proposed sequencing change (Q-9):** build the realtime transport (SSE + LISTEN/NOTIFY) at the end of Phase 2 instead of Phase 4. The outbox rows exist from Phase 1, so only the transport remains. Multi-user views without live updates feel broken, and the brief lists "realtime updates without refresh" as a core principle. Notifications and chat would stay in Phase 4.

---

## Phase 3: Intake

1. **Triage queue:** tabs for Pending, Snoozed, Accepted, Declined and Duplicates. A list and peek with a triage bar: accept (pick state, assignee, labels), decline (reason, notify), duplicate (search and link), snooze (presets). Shortcuts `Y`, `N`, `U`, `Z`.
2. **Guest submissions in-app:** a "New request" form for guests, a "My requests" list, and a guest-safe peek showing only PUBLIC comments and the public status.
3. **Form builder:** fields (short/long text, select, multi-select, date, file, email, checkbox), required/optional, help text, mapping to work-item fields or custom fields, reordering, a live preview, publish/unpublish, the slug, and settings (defaults, notifications, Turnstile, embed origins, limits).
4. **Public form `/f/[slug]`:** a cached static shell, the success state, and embed mode.
5. **Embeds:** an `<iframe>` snippet and `embed.js` (floating button + modal, postMessage resize/close), both generated with copy buttons on the settings page.
6. **Uploads:** presign, quarantine until submission, size, type and count limits.
7. **Spam protection:** honeypot, minimum fill time, per-IP and per-email rate limits, optional Turnstile, and blocking contacts.
8. **Contacts:** list and detail (submissions, and later threads), merge duplicates, block.
9. **Emails:** the Mailer with the chosen provider (Q-3), the outbox, templates (confirmation, accepted, declined, duplicate, reply notification) and the status-page magic link.
10. **Status page `/s/[token]`:** public status, PUBLIC comments, replies (which become comments from the contact) and attachments.
11. **Discord webhooks (D-052):** Settings → Integrations (add webhook, choose events, projects and whether to include content, send a test message, delivery log with redeliver). The worker's `webhook.deliver` job handles coalescing, 429 handling and auto-disable. Events: `work_item.created`, `state_changed`, `completed`, `assigned`, `intake.submitted`, `intake.accepted`.

**Accept:**

- A Discord test message arrives. A new intake submission posts one embed with no mentions resolved, and five quick edits to one item produce one message.
- A form submitted from an embed on a test HTML page (a different origin) appears in the triage queue.
- The confirmation email arrives (captured by the test mailer) and its link opens the status page.
- A contact's reply appears on the item as a PUBLIC comment. Internal comments never appear on the status page (test).
- The 21st submission from one IP within 10 minutes gets 429.
- An attachment over the limit is rejected.
- Accepting assigns the next `INFRA-n`. Declining never uses up a number.

---

## Phase 4: Inbox & messages

1. **Realtime** (unless Q-9 moves it earlier):
   - the `/api/realtime` SSE endpoint
   - a single LISTEN connection with reconnect
   - the permission-filtered fan-out
   - `Last-Event-ID` replay with a resync fallback
   - a BroadcastChannel leader tab
   - the event → query-cache mapping for every view
   - Caddy `flush_interval -1` documented
2. **Notifications:**
   - the fan-out job: mentions, assignments, state changes on subscribed items, comments, intake submissions, agent approvals and email assignments
   - grouping by `groupKey`
   - preferences
   - email digests
3. **Inbox UI:** list and reader, filters by type, read/unread, archive, snooze, bulk actions, and realtime badge counts in the sidebar and tab title.
4. **Messages:**
   - project channels (auto-created), custom channels and DMs (including DMs with the agent, which gets real replies in Phase 8)
   - threads, mentions, reactions, attachments
   - `#INFRA-42` rich previews
   - "Create work item from message", which creates a CREATED_FROM reference shown on the item's timeline
   - unread tracking and typing indicators

**Accept:**

- Two browsers: a change in one appears in the other within 1 s. After killing the network for 30 s and restoring it, missed events are replayed with no full reload.
- A mention shows up in the Inbox within 1 s, with its badge.
- Unread counts are correct across tabs.
- Typing indicators disappear within 5 s of stopping.

---

## Phase 5: Notes & My Work

1. **Quick capture:** the global `Q` shortcut and the capture bar on Home. Saving is instant (optimistic), with markdown shortcuts.
2. **Notes grid:** masonry, colours, pinning, inline editing, archive, trash.
3. **Tags:** inline `#tags` including nested ones, parsed on save, a tag tree in the sidebar, and rename/merge.
4. **To-dos:** checkboxes in notes, the `NoteTodo` projection, a "My to-dos" list across notes (toggle, due date), and converting a line to a work item with a link back.
5. **Sharing:** private, team, or attached to a project or work item (visible on the item's timeline).
6. **Convert a note** to a work item, keeping the link back.
7. **Daily review:** the resurfacing set with keep/archive/snooze/convert and a spaced-interval schedule.
8. **Search:** trigram full-text across notes.
9. **Home / My Work:** today's focus, my items by due date, my to-dos, recent notes, a calendar strip and an inbox summary.
10. **5b, after Q-6 (embeddings):** `search.embeddings` indexing, semantic search, "Ask my notes" (the local LLM with citations) and AI tag suggestions.

**Accept:**

- Capturing a note takes less than 100 ms to appear.
- Toggling a to-do in "My to-dos" updates the note card in place (same node).
- `#infra/proxmox` shows up under `infra › proxmox` in the tree.
- Converting a checkbox line creates an item and strikes the line through with an `#INFRA-n` chip.

---

## Phase 6: Analytics

1. **Metrics engine:** SQL per metric with policy scoping:
   - created vs. completed over time
   - open items by state, priority, assignee, label and type
   - throughput
   - cycle time (`startedAt → completedAt`) and lead time (`createdAt → completedAt`), as p50 and p85
   - overdue items
   - intake volume and time-to-triage
   - email first-response and resolution time (populated once Phase 7 data exists)
2. **Nightly `project_daily_stats`** for the "over time" state distributions.
3. **Default dashboards** per project and for the workspace.
4. **Chart builder:** metric × x-axis × segment + filters, with a chart type and live preview. Save to a dashboard, lay it out on a grid, and share it.
5. Charts styled per DESIGN_SYSTEM §6.

**Accept:** Metric results on the seed data match hand-computed fixtures in the tests, and every chart renders its empty, loading and error states.

---

## Phase 7: Shared mailbox

**7a: Read and collaborate**

1. An admin setup guide in the docs:
   - GCP project, service account, domain-wide delegation client id and scopes
   - Pub/Sub topic and pull subscription, and the publisher role for `gmail-api-push@system.gserviceaccount.com`
   - routing a Google Group to a real mailbox
2. Mailbox connect UI: a connection test (DWD token, label list), backfill settings and members.
3. Worker: backfill (resumable), streaming Pub/Sub pull, `history.list` sync, 404 → full resync, daily watch renewal, 5-minute polling fallback, sync logs and a status page.
4. Mail UI: views (Unassigned, Mine, Open, Snoozed, Solved, All), the thread reader (sandboxed iframe, remote images blocked, lazy attachments), internal comments with mentions, assign, status, snooze, labels, and collision presence.
5. Promote to a work item, or link to an existing one. New replies then flow onto the item's timeline.
6. Senders become or link to Contacts. Optional Gmail label mirroring.

**7b: Replying**

- Add the `gmail.send` scope, the composer (Tiptap → HTML + text), sending in the thread (`threadId`, `In-Reply-To`, `References`), send-as the mailbox or group alias, and sent status/errors.

**Accept:**

- A new email to the connected mailbox appears in Dopl within 10 s. Pub/Sub latency is typically about 1–5 s.
- Deleting `historyId` history (simulated 404) triggers a resync with no duplicates.
- An HTML email containing `<script>` and `onerror` handlers renders inert. A test checks that the iframe sandbox has no `allow-scripts`.
- Promoting a thread shows it on the item, and a follow-up reply appears on the item's timeline.
- The web container has no Google credentials, verified by inspecting env and mounts in a test.
- The Discord webhook posts new threads and messages (`email_thread.created`, `email_message.received`) for the selected mailboxes. An email subject containing `@everyone` pings nobody.

---

## Phase 8: AI teammate

1. **Agent member:** a `User(kind = AGENT)`, `AgentProfile` settings (runtime URL, key env name, model, instructions, timeouts), a status pill, and the global **Pause** switch.
2. **Runtime:** the `AgentRuntime` interface and the `HermesRuntime` adapter (Runs API, SSE event mapping, idempotency, stop, status reconciliation after restarts), plus a connectivity and capabilities check in settings.
3. **Dopl MCP server:** `/api/mcp` Streamable HTTP, `ApiToken` (MCP) management, per-run tokens, scopes and project limits, the tools from D-032, and an Activity record for every write.
4. **Triggers:** `@Dopl` in comments and chat, DMs, and assignment (with a confirm step for untrusted items). A context builder that includes trusted content only, per D-033.
5. **Run UI:** runs on the item timeline and in DMs; live streamed messages, tool calls and command output; Stop; and the final result as a comment or message.
6. **Infrastructure:**
   - the host allowlist UI (Warpgate target, environment, always-approve) and command rules UI (ALLOW_READONLY/DENY, with a tester)
   - `infra_exec`/`infra_wait`
   - the worker's SSH executor via Warpgate with output streaming, redaction and hard timeouts
7. **Approvals:** `AgentApproval` cards (exact command, host and environment, agent's reason, risk flags), the Inbox and realtime, a mobile-friendly layout, expiry, and Hermes `approval.request` bridging (once/deny only).
8. **Taint tracking**, the untrusted banner, and "Mark as reviewed" for admins.
9. **Audit:** the audit log UI with filters and CSV/JSON export.
10. **Ops guide:** Hermes configuration (API server bind/key, terminal toolset disabled, `approvals.mode: manual`, the Dopl MCP entry with `timeout: 900`) and the Warpgate user, key and roles.

**Accept, as red-team tests:**

1. An injected instruction in an email → the agent reads it via `get_email_thread` → even an allowlisted `docker ps` then requires approval.
2. A command on a host that isn't allowlisted is refused, and no SSH connection is attempted.
3. A DENY rule blocks a command even after approval.
4. Pause stops a running run within 5 s, cancels pending approvals, and refuses further tool calls.
5. Every approval shows the exact command and host, and is logged with who approved it and when.
6. The SSH key exists only in the worker container.
7. A run token from a finished run is rejected.
8. A worker restart during a run reconciles its status via `GET /v1/runs/{id}`.
