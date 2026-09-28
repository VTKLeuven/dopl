# Changelog

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
  - An HNSW index inside the Prisma-managed schema *does* drift, which led to D-017.
- No application code yet. Waiting for approval.
