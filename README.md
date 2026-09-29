# Dopl

Dopl is the VTK IT team's self-hosted workspace: project management, personal notes, a shared mailbox, team chat and an AI teammate, in one place. A ticket, the emails about it, the chat about it, the notes about it and what the agent did for it are all linked from the ticket.

- **Work items and views** (Plane-style): projects with workflows, list, board, table, calendar and timeline views, filters and saved views, sub-items and relations, ⌘K, keyboard shortcuts, live updates. Done items are hidden by default.
- **Intake:** a triage queue, public request forms (also embeddable), a status page per request, guests who file their own requests, contacts, Discord webhooks.
- **Inbox and chat:** notifications with preferences and email digests; channels per project, custom channels, DMs, threads, reactions.
- **Notes and My Work** (Blinko-style): quick capture, tags, to-dos, sharing, a daily review, notes that turn into work items.
- **Analytics:** built-in and custom dashboards.
- **Shared mailbox:** a Gmail mailbox (e.g. `it@vtk.be`) inside Dopl: assign, snooze, internal notes, replies, turn an email into a work item.
- **AI teammate:** "Dopl", on [Hermes Agent](https://hermes-agent.nousresearch.com) with the team's own model. Mention it, DM it or assign it an item; it reads and updates work items and runs commands on allowlisted servers through Warpgate, with human approval for anything that changes state.

Accounts are invite-only (email and password with 2FA, magic links, optionally Google and SSO). The public instance lives at `https://dopl.vtk.be`.

## Run it on a server

```bash
git clone https://github.com/d1ff1cult0/dopl.git /opt/dopl && cd /opt/dopl
cp .env.production.example .env     # then fill it in: docs/ops/deploy.md §2
./dopl up
./dopl bootstrap you@vtk.be "Your Name"   # prints the owner's invite link
```

**[docs/ops/deploy.md](docs/ops/deploy.md)** is the full guide: configuration, HTTPS (bundled Caddy or your own proxy), the first run, nightly backups and restoring them, updates and troubleshooting. `./dopl` wraps docker compose (`up`, `update`, `status`, `logs`, `backup`, `restore`, `bootstrap`).

Optional, later: the shared mailbox ([gmail-setup.md](docs/ops/gmail-setup.md)) and the AI teammate ([agent-setup.md](docs/ops/agent-setup.md)).

## Develop

Needs Node 24 (`.nvmrc`), pnpm 10 (via corepack) and Docker.

```bash
pnpm i
cp .env.example .env          # fill in BETTER_AUTH_SECRET and DOPL_ENCRYPTION_KEY (openssl rand -base64 32)
pnpm db:up                    # Postgres 17 + pgvector on :54320, Mailpit on :1025 / http://localhost:8025
pnpm db:deploy && pnpm db:generate
pnpm db:seed                  # workspace /vtk with sample projects, notes, mail and the agent
pnpm dev                      # web on :3000 + worker
```

Sign in at <http://localhost:3000/sign-in> as `bram@dopl.test` / `dopl-dev-password`. To try the mailbox and the AI teammate without Google, Hermes or servers, turn on the fakes in `.env` (`GMAIL_FAKE_DIR=.data/fake-gmail`, `HERMES_FAKE_PORT`, `HERMES_FAKE_MCP_TOKEN`, `AGENT_EXEC_FAKE=true`; see `.env.example`) before seeding; the e2e tests need them.

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest against a test database), `pnpm e2e` (Playwright against `pnpm dev`), `pnpm db:drift`. CI runs all of them and publishes the Docker images on every push to `main`.

## Where things are

| Path              | What                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `apps/web`        | Next.js 16 app: pages, server actions, the realtime stream, public forms, the MCP server    |
| `apps/worker`     | pg-boss worker: email, Gmail sync, webhooks, digests, analytics snapshots, agent runs       |
| `packages/db`     | Prisma 7 schema, migrations, seed, bootstrap                                                |
| `packages/shared` | zod schemas, policy (authorization), domain logic shared by web and worker                  |
| `packages/server` | server-only code shared by web and worker (storage, notifications, webhooks, agent helpers) |
| `docker/`         | production compose file, Dockerfile, Caddyfile, backup scripts                              |
| `docs/`           | the plan and its decisions (below), ops guides, screenshots per phase                       |

Start with **[docs/HANDOFF.md](docs/HANDOFF.md)** (where the project stands and what's next), then [PROMPT.md](PROMPT.md) (the brief), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md), [docs/DECISIONS.md](docs/DECISIONS.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) and [docs/CHANGELOG.md](docs/CHANGELOG.md). `CLAUDE.md` has the coding conventions.

## Credits

Plane (AGPL-3.0) and Blinko (GPL-3.0) inspired the product; no code, schemas, styles or assets were copied from them. Hermes Agent (MIT) runs as a separate service.
