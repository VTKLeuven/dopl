# Changelog

## Phase 2: Views (2026-09-29)

**Filters**

- A filter builder with quick filters (My items, Due this week, Overdue, Unassigned, High priority), rules, AND/OR and nested groups, plus a chip bar with the applied filters.
- 20 fields with per-field operators and dynamic dates (today, this week, within the last or next N days), evaluated in the workspace time zone.
- A server compiler tested against Postgres for every field × operator. Filters persist per user and appear in the URL for sharing.

**Layouts**

- **Table:** every cell editable, resizable and reorderable columns saved per view, a pinned title column, arrow-key grid navigation, sorting from the headers.
- **Calendar:** month and week, due or start date, drag to reschedule, a tray of unscheduled items, "+N more", Shift+arrow moves.
- **Timeline:** drag to move or resize (start and due change together), dependency arrows that turn red on conflicts, week/month/quarter zoom, a today line, click to schedule an undated item.
- **Board swimlanes:** a second grouping; dropping into another lane changes both properties.

**Saved views**

- Private or shared, lockable; Save, Reset and Save as new when a view has unsaved changes; favourites in the sidebar.
- Cross-project views for the whole workspace, plus an "All items" page, grouped by state group or project.

**Keyboard and palette**

- ⌘K searches items, projects, views and people, lists recents, and changes the open or focused item (state, priority, assignees, labels, due date, copy link/ID) through nested pages; → opens actions for a search result.
- One shortcut registry drives the handlers and the `?` overlay. New: ⌘Enter, ⌘A, ⇧A (assign to me), ⌘⇧, (copy link), ⌘. (copy ID), and `g` then h/p/v/s.

**Bulk actions**

- The selection bar sets state, priority, assignees, labels, type or due date, moves items to another project, archives or deletes.
- Each change is one transaction with an undo toast.

**Realtime**

- Server-sent events on Postgres LISTEN/NOTIFY: lists, boards, details and server-rendered pages update without a reload. Streams are filtered by project access and replay missed events on reconnect.

**Performance**

- `pnpm perf` seeds 50,000 items and times every view query.
- Lists load ids first, then rows with assignees and labels aggregated in SQL; they're capped at 10,000 per project and 2,000 across projects (D-062).

**Fixes found along the way**

- The attachments storage module had never been committed (a `.gitignore` pattern hid it).
- The build script's glob was expanded by the shell.
- Test fixtures could create colliding project identifiers.
- A realtime refetch could overwrite an optimistic update.

**Tests**

- 124 Vitest tests (filters, dates, views, bulk operations, realtime access, shortcut registry) and 21 Playwright tests covering every Phase 2 flow, including realtime between two tabs.

## Phase 1: Core (2026-09-29)

**Foundation**

- pnpm 10 workspace: `apps/web` (Next.js 16.3), `apps/worker` (pg-boss 12), `packages/db` (Prisma 7.10), `packages/shared` (zod schemas, policy, domain helpers, email templates).
- Migrations: `init`, `manual_constraints` (C-collated sort keys, CHECKs, append-only audit trigger, `search.embeddings` with HNSW) and `auth_plugins` (2FA, SSO). The CI drift check uses `migrate diff --from-config-datasource`.
- Docker: dev compose (Postgres 17 + pgvector on :54320, Mailpit), a multi-target Dockerfile (web, worker, migrate) and a production compose file. CI runs typecheck, lint, Vitest, the drift check, a build and the Playwright suite, then pushes images to GHCR on `main`.

**Design system and shell**

- Tailwind v4 tokens from `DESIGN_SYSTEM.md` (brand, neutral and tag palettes), re-themed Radix primitives and a `/dev/ui` gallery.
- The inset-panel shell from the Spott reference: sidebar with projects, the page header, the toolbar row and a mobile drawer. Instant navigations with `cacheComponents`, verified by `instant()` tests.
- A first ⌘K palette (navigation only; search and actions come in Phase 2) and `G H` / `G P` shortcuts.

**Authentication (invite-only)**

- Better Auth with sign-up disabled everywhere: email + password (with verification), magic link, TOTP 2FA (required for password-based Owners and Admins), SSO providers configured by admins, optional Google.
- Invites pre-create the user; `/invite/<token>` lets them choose a sign-in method. `pnpm dopl:bootstrap` creates the workspace and the first Owner.
- Account settings: 2FA enrolment and a session list with revoke. Password reset by email. Emails go through the worker (Mailpit in dev).

**Workspace and projects**

- Workspace settings: general, members (roles, deactivate), invites, authentication (SSO providers).
- Projects: create, general settings, workflow states (reassign on delete), labels, members, archive. Renamed identifiers keep old references working.
- The policy module with a full role × action test matrix. Guests get a 404 for projects they can't see.

**Work items**

- List (virtualized, grouped, sticky group headers) and board (dnd-kit, fractional sort keys, collapsed Done/Cancelled columns).
- **Done items hidden by default** with a "Done hidden · N" chip and Hide / Recent / All modes (D-053, Plane pain point #3).
- Peek panel and full page with the same layout: Tiptap description with `@` mentions and `#` item references, properties, sub-items, relations, links, attachments (drag and drop), comments with reactions, and an activity timeline.
- Create dialog with create-and-continue; pasting several lines creates several items.
- Keyboard layer: `J`/`K`, `Enter`, `C`, `X`, `S`, `P`, `A`, `L`, `D`, `Esc`, `⇧H`. A basic bulk bar for selected items.
- Optimistic updates with rollback everywhere; every mutation writes Activity and a realtime outbox row.
- Home: items assigned to me, bucketed into overdue, this week, later and no date.

**Data and tests**

- A deterministic seed: 5 projects, about 300 items, people in every role, relations and comments. `pnpm db:seed -- --reset` rebuilds it.
- 85 Vitest tests (policy, sort keys, rich-text sanitizer, work-item service against real Postgres) and 12 Playwright tests (sign-in, instant navigation, create, paste, inline edit, peek + comment, delete + undo, hide done, board drag, attachments). The e2e tests run in their own sandbox project (D-056).
- New decisions D-054 to D-061. Open items carried into Phase 2 are listed under Phase 1 in the ROADMAP.

## Phase 0: Foundations & plan (2026-09-29)

- Researched Plane and Blinko (as inspiration only, per the licence rules), plus the current docs for Next.js 16.3, Prisma 7, Better Auth, Hermes Agent and the Gmail API.
- Wrote the plan:
  - `CLAUDE.md`
  - `docs/ARCHITECTURE.md` (17 Mermaid diagrams across it and the data model, all render-checked)
  - `docs/DATA_MODEL.md`
  - `docs/DESIGN_SYSTEM.md` (OKLCH brand scales with contrast checked, tag palette, layouts, components, keyboard map)
  - `docs/ROADMAP.md`
  - `docs/DECISIONS.md` (48 entries)
  - `docs/OPEN_QUESTIONS.md` (20 questions with defaults)
- Added the full Prisma schema for all phases, `packages/db/prisma/schema.prisma`: 67 models, valid under Prisma 7.10.
- **Spikes on Postgres 17.11 + pgvector:**
  - The initial migration applies cleanly.
  - `COLLATE "C"` sort keys, CHECK constraints, the append-only audit trigger and `search.embeddings` (HNSW) cause no migration drift.
  - An HNSW index inside the Prisma-managed schema _does_ drift, which led to D-017.
- No application code yet. Waiting for approval.
