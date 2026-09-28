# Dopl — kickoff brief for Claude Code

You are starting a brand-new project called **Dopl**. This file is the complete brief. Read all of it before doing anything, then follow the "How to work" section at the end. Files referenced below are in this repository.

---

## 1. What Dopl is

Dopl is a self-hosted **project management + personal to-do + IT-team tool** for our IT team. Think of it as "Plane, rebuilt for how an IT team actually works":

- project management like Plane (projects, work items, views, intake, analytics),
- personal notes and to-dos like Blinko (fast capture, cards, tags, todos),
- a shared team mailbox (Google Workspace) where emails can be assigned, discussed and promoted to tickets,
- team chat,
- and an **AI teammate** running on our own AI server that we can talk to and hand small infra tasks to.

References (inspiration only, see licensing in §9):
- Plane — https://github.com/makeplane/plane (and https://plane.so for their docs/UX)
- Blinko — https://github.com/blinkospace/blinko
- Spott — https://spott.io (visual design reference; screenshot in `docs/design/spott-reference.png`)

### What we want to do better than Plane

- **Plane doesn't track email.** Our team's mail must live next to the tickets: shared mailbox, assignment, promote-to-ticket (§4.7).
- **Plane has no feedback/intake forms in the Community Edition.** We need public, embeddable forms (§4.4).
- **Plane can't hide done items in a project's item overview.** Completed/cancelled work must be filterable away, and hidden by default, in every project view (§4.3).

Added after Phase 0:
- **Discord webhooks** for updates, new tickets and new mails.
- **Sign-in:** Better Auth accounts (email + password) and/or SSO, next to Google. Accounts are **invite-only**.
- Dopl is **publicly reachable** at `dopl.vtk.be`. Outbound email uses the **Google Workspace SMTP relay**.

On top of that, these are non-negotiable product principles:
- **Fast.** Every interaction feels instant: optimistic updates, no full-page spinners, virtualized long lists, realtime updates without refresh.
- **Keyboard-first.** ⌘K command palette for everything, single-key shortcuts in lists (`c` create, `a` assign, `s` status, `p` priority, `l` labels, `x` select, `/` search), shortcuts shown in tooltips and menus.
- **Few clicks.** Inline editing of every property in every view; create-and-continue; paste a list of lines to create many items at once.
- **One place.** A ticket, the emails about it, the chat about it, the notes about it and what the AI agent did for it are all linked and visible from the ticket.

---

## 2. Tech stack (fixed)

| Area | Choice |
|---|---|
| Framework | **Next.js 16.3** (App Router, Turbopack, React 19.x as pinned by Next), TypeScript strict |
| ORM | **Prisma ORM 7** with PostgreSQL |
| DB | PostgreSQL 17+ with `pg_trgm` and `pgvector` extensions |
| Styling | Tailwind CSS v4 with CSS-variable design tokens |
| Components | shadcn/ui (Radix-based) as a starting point, **fully re-themed** to our design system — nothing should look like default shadcn |
| Icons | lucide-react (stroke width ~1.75) |
| Rich text | Tiptap (descriptions, comments, notes, chat) with @mentions and `#PROJ-123` work-item references |
| Tables / lists | TanStack Table + TanStack Virtual |
| Drag & drop | dnd-kit |
| Client data | Server Components for first load; TanStack Query for interactive views with optimistic mutations, invalidated by realtime events |
| Validation | zod, shared between server actions, API routes and forms |
| Auth | Better Auth (Google sign-in restricted to our Workspace domain for members; email magic link for guests) |
| Jobs | pg-boss (Postgres-backed queue — no Redis) in a separate worker process |
| Realtime | Server-Sent Events from a route handler, fanned out via Postgres `LISTEN/NOTIFY` |
| Files | S3-compatible storage abstraction (MinIO/Garage in Docker; local-disk driver for dev) |
| i18n | next-intl; UI in English first, every string through the i18n layer so Dutch can be added later |
| Testing | Vitest (unit), Playwright (e2e smoke + visual checks) |
| Deploy | Docker Compose (web, worker, postgres, object storage) behind our Caddy reverse proxy; GitHub Actions builds images |

Repo layout: a pnpm workspace (modular monolith):
```
apps/web        Next.js app
apps/worker     pg-boss worker (Gmail sync, notifications, agent runs, embeddings)
packages/db     Prisma schema, prisma.config.ts, generated client, seed
packages/shared zod schemas, types, domain logic shared by web + worker
```

### Version-specific gotchas — do not code from memory of older versions
- **Next.js 16.x**: `middleware.ts` is now `proxy.ts`; Turbopack is the default bundler; Cache Components and the opt-in **Instant Navigations** suite exist in 16.3. Since this is a greenfield app, evaluate enabling Cache Components / Instant Navigations from day one (they are slated to become default) and record the decision in `docs/DECISIONS.md`. Read the current Next.js 16.3 docs (and any agent tooling Next ships) before writing framework code.
- **Prisma 7**: `prisma.config.ts` at the package root is required; the datasource URL lives there, not in `schema.prisma`; the CLI no longer auto-loads `.env` (use `import "dotenv/config"`); use the `prisma-client` generator with an explicit `output` path and import the client from that path; a **driver adapter is mandatory** — use `@prisma/adapter-pg` + `pg`. Pool defaults differ from Prisma 6 (e.g. `pg` has no connection timeout by default) — set them explicitly. Prisma's website now defaults to v8 docs; use the **v7** docs (`prisma.io/docs/orm/v7/...`). Pin `prisma@7` and `@prisma/client@7`.
- Before adding any library, check it works with Next 16.3 / React 19.x / Prisma 7. If it doesn't, pick an alternative and note why in `docs/DECISIONS.md`.

---

## 3. Design — this matters as much as the features

We care **enormously** about design. The bar is "a product you'd pay for", not "a nice admin panel".

### 3.1 Reference: Spott
Open `docs/design/spott-reference.png` and study it. Match its feel:
- **Inset-panel app shell**: a light-grey canvas; the sidebar sits directly on the canvas (no border); the main content is a white panel with ~16px radius and a hairline border, floating with a small gap from the window edge.
- **Sidebar**: logo + name at top; a search field with a `⌘K` hint; nav items as icon + label (~15px, medium weight, grey-700); section labels in sentence case, small, light grey ("Workspace", "Records", "Tools"); the active item is a soft grey pill.
- **Page header** inside the panel: breadcrumb with icon (`Home › Candidates ⓘ`), and on the right: outlined secondary buttons with icon + chevron ("Default ▾", "View Settings ▾", "Import/Export") and one **near-black primary button** ("+ Add Candidate").
- **Toolbar row**: a search input with icon, a "Sorted by …" chip, a "Filters" chip.
- **Table**: column headers with a small icon each and a `⋮` column menu; checkbox column; generous row height (~52–56px); hairline row separators, no zebra stripes; avatar + name in the first column; emails/phones as small outlined link chips with an icon; secondary text in grey; `+N` overflow counters; **pastel tag pills** (tinted background, saturated text, subtle same-hue border); the list fades out at the bottom edge.
- Calm, airy, lots of whitespace, almost no shadows, crisp 1px borders, Inter-like typography.

### 3.2 Brand: replace Spott's orange with the Dopl logo colours
Brand assets are in `assets/brand/`:
- `dopl-mark.png` (+ 512/192/32px) — the logo mark on a **transparent** background, ready for light mode. Use this everywhere; generate favicon/app icons from it.
- `dopl-logo-original-dark.png` — the original on its dark background (#21252B). Reference only; the app is **light mode**, don't use the dark background.

The mark is a gradient from lavender to sky blue. Exact colours (sampled from the logo):

```css
--brand-lavender: #ADA8FF;
--brand-sky:      #42B0FF;
--brand-mid:      #7CACFF;
--brand-gradient: linear-gradient(135deg, #ADA8FF 0%, #42B0FF 100%);
```

The raw brand colours have low contrast on white (~2.1–2.4:1), so **never use them for text**. Accessible text shades:
```css
--accent-sky-text:      #0A6CBA; /* 5.4:1 on white */
--accent-lavender-text: #5B4FD9; /* 5.9:1 on white */
```
Build full 50–900 scales for both hues from these anchors.

How to use the brand:
- Keep Spott's **near-black primary buttons** (#16161A-ish). The brand is the *accent*, not the button colour.
- Accent uses: focus rings, selected rows/checkboxes, active states, links, the logo, progress indicators, the first series in charts, empty-state illustrations.
- The gradient is used **sparingly**: the logo, the AI teammate's identity (avatar ring, "agent is working" indicator), and at most one or two hero moments. Never as a large background fill. Avoid the generic "purple-gradient AI app" look.

### 3.3 Tokens and details
- Neutrals: canvas ≈ `#F5F5F6`, surface `#FFFFFF`, muted surface ≈ `#FAFAFA`, border ≈ `#ECECEE`, strong border ≈ `#E2E2E5`, text ≈ `#18181B`, muted text ≈ `#6B6B73`. Tune by eye against the reference.
- Tag/label palette: ~10 pastel hues (purple, red, green, lime, blue, amber, pink, teal, orange, grey), each as `bg-50 / border-200 / text-700`, matching Spott's pills.
- Radii: panel 16px, inputs/buttons 10px, pills/chips 8px, avatars round.
- Font: Inter (variable), tabular numbers in tables and dates.
- Status icons in Plane's style (backlog = dashed circle, unstarted = empty circle, started = partially filled circle, completed = check, cancelled = x), coloured per state group. Priority as bar icons, "Urgent" as a red filled icon.
- Density toggle: comfortable (Spott-like) and compact rows.
- Motion: 120–200ms ease-out, no bounce. Popovers/menus: white, 1px border, very soft shadow.
- Every screen needs designed **empty, loading (skeleton) and error states**. No layout shift when data arrives.
- Light mode only for now, but everything goes through tokens so dark mode is possible later.
- Accessible: visible focus, proper roles/labels, full keyboard operation.

### 3.4 Design process requirements
- Write `docs/DESIGN_SYSTEM.md` (tokens, components, patterns) and build a `/dev/ui` route that shows every component in all states.
- For every UI task: run the app, take Playwright screenshots, **compare them yourself against `spott-reference.png`**, and iterate before calling the task done. Fix alignment, spacing, and typography inconsistencies you notice without being asked.

---

## 4. Domain & features

### 4.1 Structure, users and roles
- **Workspace** (one for now, but model `workspaceId` everywhere) → **Projects**.
- Each project has members with a role: **Admin**, **Member**, **Guest**. Workspace roles: **Owner**, **Admin**, **Member**, **Guest**.
- **Guests** can submit intake tickets, see and comment on their own submissions, and (if allowed per project) view the project read-only.
- **Contacts**: external people without an account (people who submit public intake forms or email us). One Contact record per email address, linked to their submissions and email threads.
- **Agent members**: the AI teammate is a workspace member of type `AGENT` (see §4.8).
- Project settings: identifier prefix (e.g. `INFRA` → `INFRA-42`), workflow states, labels, members, intake settings, default view.

### 4.2 Work items
Fields: sequential identifier per project, title, rich-text description, **state** (per-project workflow; each state belongs to a group: backlog / unstarted / started / completed / cancelled), **priority** (urgent/high/medium/low/none), **type** (task, bug, incident, request, feature — configurable), assignees (multiple, can include the agent), labels (multiple, coloured, per project), start date, due date, estimate (optional), **parent** + sub-items (with progress roll-up), **relations** (blocks / blocked by / relates to / duplicate of), attachments, links, subscribers.

Detail views: a **peek panel** (slide-over from the right, used from every view) and a **full page**. Both show: properties sidebar, description, sub-items, relations, attachments, and a unified **timeline** (comments, activity history, linked emails, agent runs). Comments support mentions, reactions, edit/delete.

Bulk actions on multi-select. Archive + restore. Copy link / copy identifier. Create from anywhere with `c`, with the current view's filters pre-filled.

### 4.3 Views, display options and filters
Layouts (like Plane): **List, Board (kanban), Calendar, Table (spreadsheet), Timeline (Gantt)**.
- **Display options**: group by and sub-group by (state, priority, assignee, label, type, parent, project), order by, show/hide sub-items, show empty groups, which properties are visible, density.
- **Filters**: a composable filter builder (property + operator + value, AND/OR), quick filters ("My items", "Due this week", "Overdue", "Unassigned").
- **Saved views**: personal or shared, per project and cross-project (workspace views).
- Board: drag between columns and within columns (manual ordering with fractional indexes), drag across swimlanes changes the grouped property.
- Table: inline editing of every cell, resizable/reorderable columns, virtualized for 10k+ rows.
- Calendar: month and week, drag to reschedule, items without dates in a side tray.
- Timeline: bars from start→due date, drag to move/resize, dependency arrows from "blocks" relations, zoom (week/month/quarter). Build it custom so it matches the design system.

### 4.4 Intake
- Per-project **intake queue** (triage): accept (moves to backlog, optionally assign/label), decline (with reason, notifies submitter), mark as duplicate (link to existing item), snooze.
- Guest users submit from inside the app.
- **Public intake forms** (Plane only has this in paid tiers): a form builder per project (field types: short/long text, select, multi-select, date, file upload, email, checkbox; required/optional; help text; maps to work-item fields or custom intake fields).
  - Hosted at a public URL (e.g. `/f/<slug>`), styled with our design system.
  - **Embeddable**: an `<iframe>` snippet and a small JS snippet (floating "Feedback" button that opens the form in a modal). Both generated from the form settings page with copy buttons.
  - No account needed: submitter enters their email → a Contact is created/linked → they get a confirmation email with a magic link to a status page where they can follow the ticket and reply.
  - Spam protection: honeypot, rate limiting per IP/email, optional Cloudflare Turnstile. Attachment size/type limits.
- Email intake (later, via §4.7): a connected mailbox can be configured to create intake items.

### 4.5 Inbox and messages
- **Inbox** = notifications: mentions, assignments, state changes on subscribed items, intake submissions, agent approvals needed, email assignments. Mark read/unread, archive, snooze, filter by type. Realtime badge counts.
- **Messages** = team chat: a channel per project (auto-created) + custom channels + DMs, threads, mentions, reactions, attachments, rich `#INFRA-42` previews, "create work item from message", unread tracking, typing indicators. The AI teammate can be DM'd or mentioned in channels.

### 4.6 Stickies, notes and personal to-dos (Plane stickies × Blinko)
Plane's stickies are nice but shallow; Blinko is the model for how this should feel.
- **Quick capture** from anywhere (global shortcut + a capture bar on Home), saved instantly, markdown supported.
- **Card grid** (masonry) with colours and pinning; fast inline editing.
- **#tags written inline**, including nested tags (`#infra/proxmox`), with a tag tree in the sidebar.
- **To-do cards**: checkboxes inside notes; a combined "My to-dos" list across all notes.
- Private by default; can be shared with the team or attached to a project/work item.
- **Convert** a note (or a single checkbox line) into a work item, keeping a link back.
- **Daily review / resurface**: a small daily set of older notes to revisit, archive or act on.
- Full-text search; later semantic search and "ask my notes" via the local LLM (pgvector embeddings), plus AI tag suggestions.
- **Home / My Work** page: today's focus, items assigned to me (by due date), my to-dos, recent notes, calendar strip, inbox summary.

### 4.7 Shared mailbox (Google Workspace)
We use Google Workspace. Dopl tracks the mailboxes we connect (e.g. our IT team address) and turns them into a collaborative inbox:
- **Connection**: a Google Cloud service account with **domain-wide delegation**, configured by a workspace admin; only mailboxes explicitly connected in Dopl settings are synced (never "all personal mail"). Scopes: start with `gmail.readonly` + `gmail.modify`, add `gmail.send` when replying is built. Mailboxes must be real user mailboxes (a Google Group address can't be read via the Gmail API — document how to route it to a mailbox).
- **Sync** (in the worker): initial backfill (configurable, e.g. 90 days), then incremental sync via `history.list`. Use Gmail push (`users.watch`) with a **Pub/Sub pull subscription** so Dopl doesn't need a public webhook; renew the watch well before it expires; fall back to periodic polling. Idempotent, resumable, handles `historyId` gaps with a full resync.
- **UI** (think Front/Missive): thread list with views Unassigned / Mine / Open / Snoozed / Solved / All; thread view with messages and **internal comments** interleaved (visually distinct), @mentions of teammates (→ Inbox notification); assign, set status, snooze, label; **promote to work item** or link to an existing one (the thread then appears on the item's timeline and new replies keep flowing in); collision indicator when someone else is viewing/replying.
- Replying from Dopl (later phase): send via the Gmail API in the same thread (correct `threadId`, `In-Reply-To`, `References`).
- Optionally mirror status to Gmail labels (e.g. `Dopl/Solved`).
- **Security**: render email HTML sanitized inside a sandboxed iframe, block remote images by default, never execute scripts; attachments fetched lazily.
- Senders become/link to **Contacts**.

### 4.8 AI teammate
We run our own AI server with **Qwen 3.8 27B** behind an OpenAI-compatible API. We want an AI teammate inside Dopl that we can chat with and give small tasks (e.g. "SSH into server X and move docker container Y to another port").

Architecture:
- The agent runtime is **Hermes Agent** (Nous Research, MIT) pointed at our local model, but Dopl talks to it through an `AgentRuntime` interface so the runtime can be swapped.
- Hermes exposes an OpenAI-compatible **API server** (default port 8642, bearer key; `/v1/chat/completions` with SSE streaming, stateful `/v1/responses`, session headers like `X-Hermes-Session-Id`). It also has a JSON-RPC "TUI gateway" (stdio or WebSocket) that exposes sessions, **approvals** and streaming events, and an ACP server. **Read the Hermes docs ("Programmatic Integration", "API Server", "Security") and choose the protocol that lets Dopl surface approval requests** as Approve/Deny UI; record the choice in `docs/DECISIONS.md`.
- Dopl exposes its own **MCP server** (HTTP, per-agent token, scoped permissions) so the agent can search/read/create/update work items, comment, and read threads it has been assigned. Check which MCP transports Hermes supports and match it.
- The agent appears as a member: it can be @mentioned in comments/chat, DM'd, and assigned work items. Every run shows up on the work item timeline: prompt, tool calls, commands, outputs (streamed live), approvals, result.

Safety — non-negotiable:
- **Human approval** for anything that changes state on infrastructure: Dopl shows the exact command and target host; a member approves or denies; approvals are logged with who/when.
- Read-only commands may run without approval only if they match an allowlist configured in settings.
- **Host allowlist**; the agent uses a dedicated SSH user/key with minimal privileges, routed through our SSH bastion (Warpgate) so sessions are recorded. Never root keys, never secrets in prompts.
- **Prompt-injection boundary**: content from intake forms, emails and Contacts is untrusted. It is never passed to the agent automatically. When a human asks the agent to work on such content, the run is flagged "untrusted input" and *every* tool action needs approval.
- Kill switch: stop any running agent task from the UI; global "agent paused" toggle.
- Full audit log of agent activity, exportable.

### 4.9 Analytics
- Per project and workspace-wide: created vs. completed over time, open items by state/priority/assignee/label/type, throughput, cycle time and lead time, overdue items, intake volume and time-to-triage, email first-response and resolution times.
- A simple chart builder like Plane's (pick metric, x-axis, segment) and saved dashboards.
- Charts styled with the design system (brand accent as first series, tag palette for categories).

---

## 5. Data model expectations
Design the **complete Prisma schema for all phases up front** (even for features built later) so later phases don't need disruptive migrations. Include at least: Workspace, User, Session/Account (auth), WorkspaceMember, Project, ProjectMember, WorkflowState, Label, WorkItem (+ assignees, labels, relations, subscribers), Comment, Reaction, Activity (append-only history), Attachment, View (saved views), IntakeItem, IntakeForm (+ fields), Contact, Notification, Channel, ChannelMember, Message, Note (+ tags, todos), Mailbox, EmailThread, EmailMessage, EmailComment, AgentRun (+ steps, approvals), AuditLog. Use fractional indexing for manual ordering, soft delete/archive where users expect undo, and indexes for every filter/group-by in §4.3. Explain the model in `docs/DATA_MODEL.md` with an ER diagram (Mermaid).

---

## 6. Roadmap (phases)
0. **Foundations & plan** (this session — see §8).
1. **Core**: monorepo scaffold, design system + app shell + `/dev/ui`, auth (Google Workspace-domain sign-in, guest magic links), workspace/projects/members/roles, work items with all fields, List + Board views, peek panel + detail page, comments + activity, realistic seed data (several projects, ~300 items, labels, members).
2. **Views**: Table, Calendar, Timeline; display options; filter builder; saved views; ⌘K palette; keyboard shortcuts; bulk actions.
3. **Intake**: triage queue, guest submissions, public forms + embeds, Contacts, confirmation emails + status page.
4. **Inbox & messages**: notifications, realtime (SSE + LISTEN/NOTIFY), channels, DMs, threads.
5. **Notes & My Work**: stickies/notes, tags, to-dos, daily review, Home page.
6. **Analytics**.
7. **Shared mailbox** (Gmail sync, assignment, internal comments, promote to work item; replying after that).
8. **AI teammate** (Hermes integration, MCP server, approvals, audit).

Each phase ends with: passing typecheck/lint/tests, a Playwright smoke test of the main flows, screenshots reviewed against the design reference, and a short `docs/CHANGELOG.md` entry.

---

## 7. Engineering conventions
- TypeScript strict, no `any` in app code. zod at every boundary.
- All authorization checks server-side in one place (a policy module), never only in the UI. Every query scoped by workspace and role.
- Server actions for mutations from the UI; route handlers for public/embed endpoints, SSE, MCP and webhooks. Rate limiting on public endpoints.
- Every mutation writes an `Activity` record and emits a realtime event.
- Secrets only via environment variables; `.env.example` kept complete and documented.
- Docker Compose for local dev (Postgres + object storage) and production; health checks; migrations run on deploy.
- Small, focused commits with clear messages.
- Maintain `CLAUDE.md` with project conventions, commands and gotchas so future sessions start with the right context.

---

## 8. How to work — start here

**Step 1 — Research (read-only).** Shallow-clone Plane and Blinko into a temp directory *outside this repo* and study their data models and UX flows (Plane: work items, states, views, intake, stickies; Blinko: notes, tags, todos, review). Read the current Next.js 16.3, Prisma 7 (v7 docs), Better Auth, Hermes Agent and Gmail API docs for the parts we use. Look at `docs/design/spott-reference.png` and `assets/brand/`.

**Step 2 — Write the plan (no app code yet).** Create:
- `CLAUDE.md`
- `docs/ARCHITECTURE.md` (components, request/realtime/job flows, agent integration, security model — with Mermaid diagrams)
- `docs/DATA_MODEL.md` + the full `packages/db/prisma/schema.prisma`
- `docs/DESIGN_SYSTEM.md` (tokens incl. the exact brand colours above, components, layout patterns)
- `docs/ROADMAP.md` (phases from §6 broken into tasks with acceptance criteria)
- `docs/DECISIONS.md` (every non-obvious choice, with alternatives considered)
- a list of **open questions** for me.

**Step 3 — Stop.** Summarize the plan and the open questions and wait for my approval before writing application code.

**After approval** — build Phase 1, then continue phase by phase. After each phase, stop, show me screenshots, and summarize what's done and what's next.

---

## 9. Licensing
Plane (Community Edition) is **AGPL-3.0** and Blinko is **GPL-3.0**. Use them strictly as product/UX inspiration: **do not copy code, schemas verbatim, styles or assets** from either. Hermes Agent is MIT and runs as a separate service. Spott is proprietary — match its *feel*, don't copy its assets.
