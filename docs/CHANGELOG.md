# Changelog

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
