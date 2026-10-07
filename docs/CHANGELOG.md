# Changelog

## After going live (2026-09-30)

- **Mail from the keyboard** (D-128): `↑`/`↓` (or `J`/`K`) move through the conversations and open them; `⌫` ignores the open one and moves on, with Undo. Ignored conversations leave every view except All, where they are marked and can be moved back to open. The reader has an Ignore button too, and the `?` overlay lists the keys.
- Solving or ignoring a conversation takes it out of the list at once, without waiting for the refresh.
- **Sidebar** (D-129): a larger logo and wordmark, and more compact navigation rows, so the project list gets more room.
- **Automatic deploys** (D-130): every push to `main` that passes CI is deployed by the Deploy workflow (`./dopl deploy <sha>` over SSH). One-time setup in `docs/ops/deploy.md` §7.
- **SSO sign-in works** (D-131): an invited person on the identity provider's domain is signed in and their invite accepted, instead of landing back on the sign-in page. A provider is trusted only for its own domain. When Google or SSO sign-in fails, the sign-in page now says why (not invited, can't be linked, no access, cancelled).
- **Delete an account** (D-132): Settings → Members → ⋯ → Delete account…, confirmed by typing the address. Their private data goes; work items, comments and messages stay without their name; shared views and dashboards move to you. Deactivate is still there for people who may come back.
- **The AI teammate's picture** (D-133): upload one in Settings → AI teammate. The sidebar, the agent page and run cards show its own name and picture.
- **Sidebar** (D-134): smaller rows so a project's views, analytics and intake fit without scrolling; Analytics moved up with the other pages, Contacts into your account menu; a larger logo with "Dopl" in Outfit, in the same space.

## Mail cleanup and folding columns (2026-10-02)

- **Ignore rules** (D-136): Settings → Mailboxes → a mailbox → Ignore rules, or ⋯ → "Always ignore this sender…/subject…" in the reader. Mail whose sender or subject contains the text arrives as Ignored: never in Open, no notification, nothing on Discord, still under All. Adding a rule can also ignore the open conversations it matches. Admins only; audit-logged. Migration `20261002141647_mail_ignore_rules`.
- **Real senders behind a Google Group** (D-136): mail the group rewrote to "'Name' via IT" is stored under the original sender, so contacts and the list name the right person and sender rules match the real address.
- **Folding columns** (D-137): Mail's views, Notes, Settings, Analytics and Messages fold their second column to icons with the button at the bottom or `[`, remembered per page.
- **Folded composer** (D-137): the reply/internal-note box starts as one row and opens when you pick Reply or Internal note; a draft survives folding it.

## Personal mailboxes (2026-10-02)

- **My mailbox** (D-138): Settings → My mailbox connects your own work mailbox (the address you sign in with). It shows up in Mail with a lock, next to the shared mailboxes, and **only you** see it: not your teammates, not the admins, not the AI teammate. It adds no contacts, sends nothing to the Inbox or Discord, and you set its ignore rules and replies yourself.
- **Group mail isn't tracked twice:** mail to a shared mailbox (or one of its aliases) that you also get through a group stays in the shared mailbox only. If your mailbox happens to sync first, the shared mailbox takes it over.
- Everyone on the team now sees **Mail** in the sidebar, with a way to connect their own mailbox when no shared one is theirs.
- An email from your own mailbox linked to a work item shows teammates only "a private email from their own mailbox".
- Deactivating someone pauses their mailbox; deleting the account deletes it. Migration `20261002165515_personal_mailboxes`; no new env vars or queues.

## One feedback page (2026-10-03)

- **`/feedback`** (D-139): one public page (`https://dopl.vtk.be/feedback`) that lists the projects' feedback forms; picking one opens that form, which links back with "All feedback forms". No account needed, like the forms themselves.
- **Choose which forms are listed:** a form's builder → Details → "Show on the feedback page". Only published forms of projects with intake on appear; the forms list marks the listed ones with an icon. It's off for existing and new forms until you turn it on.
- No migration (the switch lives in the form's settings), no new env vars. Screenshots `docs/screenshots/phase-3/10` to `14`.

## Skip approvals (2026-10-07)

- **Approvals can be switched off** (D-140): Settings → AI teammate → Approvals → "Skip every approval". Dopl then runs every command and change at once, on every host, also after reading email or form content, and answers Hermes' own requests with "once". Hosts that aren't listed, DENY rules and Pause still stop it, and everything stays on the run and in the audit log. Admins only, with a confirmation; audit-logged.
- While it's on, the Dopl page shows everyone a banner, the hosts list no longer says "always asks", and the rule tester says a command runs because approvals are off.
- No migration (the switch lives in the agent profile's settings), no new env vars or queues. Screenshots `docs/screenshots/phase-8/12` to `17`.

## Going live (2026-09-30)

- **`docs/ops/deploy.md`**: from a fresh server to `https://dopl.vtk.be`: configuration, HTTPS (bundled Caddy or your own proxy, with the SSE paths unbuffered), the first run with `bootstrap` and 2FA, backups and restores, updates, troubleshooting.
- **`./dopl`**: `up`, `update [sha]`, `bootstrap`, `status`, `logs`, `backup`, `restore`, `down` over the production compose file.
- **`.env.production.example`**: the production settings, with the commands that generate the secrets.
- **Production compose:** uploads on a volume shared by web and worker (owned by the app user), a nightly **backup** container (database dump and uploads archive, pruned after 14 days), and optional Caddy.
- **`README.md`**: what Dopl is, running it, developing it, and where the docs are.
- Tested end to end against the published images, including a restore (D-125).

## Phase 8: AI teammate (2026-09-29)

**Asking Dopl**

- @mention Dopl in a comment or a chat message, DM it, or assign it a work item. Each request is a run: the item's timeline (or the conversation) shows it live, with Dopl's messages, the tools it used, the commands it ran with their output, approvals, and Stop.
- The answer comes back as Dopl's comment on the item or its message in the chat (in the thread when it was mentioned in a channel), and the person who asked gets an Inbox notification.
- Dopl is told only team-written context: the item, recent comments by members, the conversation. Text from forms, emails, contacts and guests stays out unless you ask about that item; then the run is marked **Untrusted input** (D-033, D-118).

**Infrastructure, with approvals** (D-031)

- Dopl reaches servers only through `infra_exec`, on hosts in Settings → AI teammate → Hosts, through Warpgate as its own low-privilege user. A host that isn't listed is refused without connecting.
- Read-only commands matching an allow rule run at once, unless the host always asks (production) or the run read untrusted content. Everything else waits for a person. DENY rules block a command even after approval, including inside chained commands.
- **Approval cards** show the exact command and host with its environment, Dopl's stated reason (marked unverified) and risk flags; production asks once more. They appear in the run, on the Dopl page, in the Inbox (with a sidebar badge) and work on phones. Deny with a note; Dopl is told who said no and why.
- Output streams live, secrets are masked, long logs are kept in storage, and commands are killed after 5 minutes (configurable).

**Control**

- **Stop** on any run, and a **Pause** switch (Dopl page and Settings) that stops every run within seconds, cancels pending approvals and refuses new work.
- **Dopl** page (`/<ws>/agent`): what's waiting for approval, and recent runs; `/<ws>/agent/runs/<id>` shows one run in full, including what Dopl was told.
- **Settings → AI teammate** (admins): add Dopl, turn it on or off, the Hermes URL, key variable, model, extra instructions, timeouts and context budget, **Check connection**, hosts, command rules with a **Try a command** tester, and MCP tokens (shown once) with the Hermes config to paste.
- **Settings → Members:** let a member approve Dopl's actions ("Approves Dopl").
- Items written outside the team show a banner; admins can **Mark as reviewed**. Assigning Dopl to such an item asks first.
- **Settings → Audit log** (admins): every approval with who and when, every command started, finished or refused, pauses, rule and token changes, sign-in and settings events; filters and CSV/JSON export (the export is logged too).

**Under the hood**

- The worker drives Hermes through the Runs API (D-115) and executes commands over SSH via Warpgate with a pinned host key (D-122). Runs survive worker restarts by re-attaching (D-119).
- Dopl's MCP server at `/api/mcp` (Streamable HTTP): `search_work_items`, `get_work_item`, `create_work_item`, `update_work_item`, `add_comment`, `list_assigned_threads`, `get_email_thread`, `list_hosts`, `infra_exec`, `infra_wait`. Every call is a step on the run; writes in a tainted run need approval.
- Dev and CI use a fake Hermes and a fake executor (D-121); `docs/ops/agent-setup.md` covers the real setup.
- New env: `HERMES_API_KEY`, `WARPGATE_*`, `AGENT_SSH_*`, `AGENT_EXEC_TIMEOUT_SEC` (worker.env); `HERMES_FAKE_PORT`, `HERMES_FAKE_MCP_TOKEN`, `AGENT_EXEC_FAKE` (dev/CI). New queues: `agent.run`, `agent.exec`, `agent.runtime-approval`, `agent.stop`, `agent.check`, `agent.reconcile`. No migrations. New dependencies: `@modelcontextprotocol/sdk` (web, worker), `ssh2` (worker).

**Fixes**

- The agent's context wrapped an untrusted item's description but not its title; titles are now handled the same way.

## Phase 7: Shared mailbox (2026-09-29)

**Connecting a mailbox** (Settings → Mailboxes, admins)

- `docs/ops/gmail-setup.md` walks a Google Workspace admin through the service account, domain-wide delegation, the Pub/Sub topic and pull subscription, and what to do when the IT address is a Google Group.
- Connect a mailbox with its address, display name, import window and members. The worker tests the connection (a token for that mailbox and its label list), imports the window (resumable, quiet: no notifications for old mail), then starts push.
- The mailbox page shows the status, last sync, push expiry, the last 20 sync runs and the last error, with Test connection, Sync now, Pause/Resume, and settings for members, the default assignee and "Reply from Dopl".

**Sync** (worker)

- Pub/Sub is pulled over REST (no public webhook). Each notification queues `gmail.sync`, which reads `history.list` from the stored `historyId`. A 404 (history expired) queues a full resync, and messages are never duplicated: ingest is idempotent on the Gmail message id.
- `users.watch` is renewed every night; a 5-minute poll catches anything push missed and picks up newly connected mailboxes.
- Attachments are fetched on first open and then stored.
- The person on the other side becomes (or links to) a Contact, whose page now lists their conversations. Mail from a blocked contact is kept but ignored.
- A reply to a solved conversation reopens it; the first answer from the team sets its first-response time.

**Mail** (`/<ws>/mail`, members of a mailbox)

- Views: Unassigned, Mine, Open, Snoozed, Solved, All, with counts, search, and the mailbox picker when there are several.
- The reader: older messages collapsed, HTML in a sandboxed frame (no scripts, no same-origin, remote images hidden), attachments, and internal notes with @mentions (between the messages, never sent).
- Assign, solve/reopen, snooze (the snooze wakes the thread and tells the assignee), and workspace labels.
- "Viewing" and "replying" presence, so two people don't answer the same email.
- **Create work item** from a thread (the text becomes the description, marked untrusted for the AI teammate, D-033) or **Link to item**. Linked items show the conversation on their timeline, and later replies appear there live.
- On phones the list and the reader are separate screens.

**Replying (7b)**

- The composer has Reply and Internal note. A reply is queued and sent by the worker through the mailbox in the same Gmail thread (`In-Reply-To`, `References`), as the mailbox or its send-as alias, with HTML and text parts. It shows as sending, sent or failed (with the reason).
- Off per mailbox until an admin turns on "Reply from Dopl" (it needs the `gmail.send` scope).

**Notifications and Discord**

- The assignee hears about new replies (`EMAIL_REPLY`), @mentions in notes (`EMAIL_MENTION`) and ended snoozes; Inbox rows open the conversation.
- Discord webhooks can post `email_thread.created` and `email_message.received`, filtered by mailbox. Subjects and senders are escaped, so `@everyone` pings nobody.

**Security**

- Only the worker holds Google credentials: they live in `worker.env` and `docker/secrets`, which production mounts into the worker only. The web app refuses to start if it sees them, and a test checks the compose file and the web env (D-027).
- Email HTML is sanitized on ingest (DOMPurify: no scripts, handlers, forms, `javascript:` links or remote style backgrounds) and shown only in a sandboxed frame with a strict CSP (D-028). An e2e test proves a hostile email runs nothing.

**Development**

- `GMAIL_FAKE_DIR` points the worker at a file-backed fake Gmail (never in production). The seed writes six conversations for `it@vtk.be` (members Bram and Chloé), and the e2e tests "receive" mail by appending to it.

**Migration:** `20260929131612_mailbox_connection_test` (a `CONNECTION_TEST` sync kind). New worker queues: `gmail.test`, `gmail.backfill`, `gmail.sync`, `gmail.watch-renew`, `gmail.poll`, `gmail.fetch-attachment`, `gmail.send`. New package: `@dopl/server` (storage, webhook dispatch and notifications, shared by web and worker).

## Phase 6: Analytics (2026-09-29)

**Metrics**

- Eleven metrics:
  - open and overdue items
  - created and completed items, created vs completed, throughput
  - cycle time and lead time as median and 85th percentile, in days
  - intake requests and time to triage
  - open items over time
- Charts go over time (day, week, month) or by state group, state, priority, assignee, label, type, project, or request status and source, optionally split by a second dimension.
- Every chart counts only what the reader can see, then applies its own filter (the views' filter builder) and the dashboard's period. Number tiles compare with the previous period of the same length; the delta is green or red depending on which way is good.
- The nightly `analytics.snapshot` job (23:55 in the workspace's zone) records each project's open items by state group and priority, plus the day's counts, in `project_daily_stats`. "Open items over time" reads those and adds today's live numbers.

**Dashboards** (`/<ws>/analytics`, and **Analytics** under each project)

- A built-in overview for the workspace (13 charts) and for every project. Duplicate one to make your own copy.
- Your own dashboards: add a chart, drag to reorder, pick a width (small, medium, large, full), view any chart as a table, rename, share with the team (read-only for others), delete.
- The period (30 days, 90 days, 6 months, 12 months) and a project filter sit in one row above the charts and live in the URL.
- The chart builder: metric, x-axis, split, chart type (bars, stacked bars, line, area, donut, number, table) and filters, with a live preview. It only offers combinations that make sense for the metric.
- Every chart has a skeleton its own size while loading, an empty state, and an error with a retry. Changing the period keeps the old chart until the new one arrives.
- Tools → Analytics in the sidebar (members only) and `G A`.

**Charts**

- Recharts 3 behind one `ChartView`, styled per DESIGN_SYSTEM §6:
  - bars at most 24 px with rounded tops, and a 2 px gap between stacked segments
  - 2 px lines, and areas as a 10% wash
  - hairline horizontal grid, no axis lines
  - a popover tooltip, and a legend for two or more series
- The series order was checked for colour-blind separation and changed from §6 (D-099). Colours follow the entity (state, project, label, person), never the rank.

**Fixes on `main`**

- CI's chat and note-capture timing checks send one untimed warm-up first on the cold dev server (the thresholds are unchanged).

**Seed**

- 120 days of approximated project snapshots, so "open items over time" has history in dev.

**Tests**

- Vitest:
  - the aggregation against hand-computed fixtures: time zones, week buckets, percentiles, multi-assignee counts, segments, folding into Other, snapshots
  - the metric reads on real rows: project scope, filters, private projects, guests
  - dashboards: duplicate, privacy, reorder, remove
  - the dashboard policy and the snapshot job
- A 50,000-item benchmark (`analytics.perf.ts`).
- Playwright (`analytics.spec.ts`):
  - the overview's 13 charts and the period in the URL
  - loading, empty and error states (data request intercepted)
  - duplicate, the builder with preview, drag to reorder, resize, remove
  - a project's analytics
- Decisions D-099 to D-106.

## Phase 5: Notes & My Work (2026-09-29)

**Notes** (`/<ws>/notes`)

- Quick capture from the bar on Notes and Home, or `Q` on any page (a small dialog). `⌘/Ctrl+Enter` saves; the card appears at once (optimistic, about 40 ms in dev) and the editor is ready for the next note. Markdown shortcuts, `[ ]` for a checkbox, `#` completes existing tags and `#INFRA` links a work item.
- A masonry grid with Pinned and Others, ten card colours, pin, inline editing with autosave (Esc or clicking away closes it), a full-size note dialog (`?note=`), archive, and trash with restore and delete for good. The trash empties itself after 30 days.
- A side column with All, Pinned, Shared with me, My to-dos, Daily review (with a count of what's due), Archive and Trash, all with counts.
- Search across your notes and the ones shared with you, and notes in the ⌘K palette with an excerpt.

**Tags**

- `#tags` in the text, nested with `/` (`#infra/proxmox` shows as `infra › proxmox`), parsed on save with parents created implicitly.
- The tag tree filters the grid by a tag and everything below it. Rename, merge into another tag, or delete (which removes the tag from the notes' text) from each tag's menu.

**To-dos**

- Every checkbox in a note is a to-do, keyed by a stable block id so due dates and links survive edits.
- My to-dos (`/<ws>/notes/todos`): open ones grouped by Overdue, Today, This week, Later and No date; Done; Converted. Tick, set a due date, or open the note from each row. Ticking one here updates the note card in place.
- Convert one checkbox line into a work item in any project you can create items in: the line is struck through with an `#INFRA-n` chip, and the item links back to the note.

**Sharing and work items**

- Notes are private by default. Share one with the team, or attach it to a project or a work item, to make it readable for the people who can see that. Only the owner edits.
- Convert a whole note into a work item (its first line becomes the title, the note the description).
- A work item lists its notes (attached, or the note it came from), and its timeline shows "created this from a note", without the text when the reader can't open that note.

**Daily review** (`/<ws>/notes/review`)

- Up to five older notes a day, drawn so older and rarely reviewed notes come up more often. Keep (back in 1, 3, 7, 21, then 60 days), snooze (1, 3 or 7 days), archive, or convert to a work item. A progress bar, and "N notes come back tomorrow" when you're done.

**Home / My Work** (`/<ws>/home`)

- The capture bar, a week strip with items and to-dos due each day, Today's focus (in-progress items and what's due today), Assigned to me by due date, a review reminder, My to-dos, an Inbox summary and recent notes. On phones the week strip shows a count per day.

**Fixes**

- Enter right after a `#tag` started a new line only if the popup had nothing to offer; now an empty suggestion list never swallows Enter or Tab (comments and chat included).
- Pickers opened inside a dialog were hidden behind it; popovers and menus now share the dialog layer.
- CI's e2e setup ran out of time compiling routes on a cold dev server; it has a 240 s budget and warms the notes routes too.

**Seed**

- Ten notes: Bram's with nested tags, to-dos with due dates, colours, a pinned and an archived note, and older notes due for review; one Chloé shares with the team and one Dries attached to INFRA. `--reset` rebuilds them.

**Tests**

- Vitest: tag parsing and rewriting, the to-do projection, the review schedule and pick, the notes policy, and the notes service (create, update, share, toggle, convert a line or a note, review, tags, trash), including the timeline reference and its privacy. 229 tests in total.
- Playwright (`notes.spec.ts`): capture in under 100 ms timed in the page, a nested tag in the tree, ticking a to-do on Home updating the card in place, converting a checkbox line (chip, strike-through, timeline link), and `Q` from another page.
- Decisions D-092 to D-098.

## Phase 4: Inbox & messages (2026-09-29)

**Realtime**

- One stream per browser: tabs elect a leader with Web Locks, and it relays events to the other tabs over a `BroadcastChannel`. When the leader closes, the next tab takes over and resumes from the last event id any tab saw.
- A watchdog reopens a dead stream (the keepalive is now a named `ping` event), and the stream reopens when the browser comes back online.
- Typing indicators travel as ephemeral events on a second `LISTEN` (`dopl_ephemeral`): never stored or replayed, and permission-checked like the rest.
- `channel:<id>` topics follow the chat policy. Live events that arrive during a `Last-Event-ID` replay are held back and sent after it, without duplicates.

**Notifications**

- Subscribers hear about state changes, grouped into one row per item with an "N updates" count, and update notifications carry the item's identifier.
- Mentions and thread replies in chat reach the Inbox. Hooks are ready for email assignments and mentions (Phase 7) and agent approvals (Phase 8).
- Settings → Notifications: per type, in the Inbox and/or by email.
- The `email.digest` job runs every 10 minutes and sends each person one `inbox.digest` email with their unread notifications that haven't been emailed yet.

**Inbox** (`/<ws>/inbox`)

- A list next to a reader. The reader shows the work item (the same detail as the peek), the chat thread for message notifications, or a short card with a link.
- All/Unread, a type filter, Snoozed and Archived. Opening a notification marks it read.
- Archive, snooze presets and read/unread on a row, in the reader or on a selection; optimistic with rollback, and archive has an undo toast.
- Keyboard: `J`/`K`, `X`, `E`, `U`, `Z`, `Esc`; `G I` goes to the Inbox and `G M` to Messages.
- A realtime unread badge in the sidebar and a "(n)" prefix in the tab title.

**Messages** (`/<ws>/messages`)

- Project channels, public and private custom channels, DMs and group DMs.
- Unread tracking (bold, dot or count) and @mention counts.
- Threads in a side panel, with follow/unfollow.
- The composer has @mentions, `#INFRA-42` chips (state icon and title), reactions, attachments (paste or drop), edit, and delete with undo.
- Typing indicators disappear within about 4 s of stopping.
- "Create work item from message" makes the item and a `CREATED_FROM` reference, shown as a chip under the message and on the item's timeline. `#item` mentions show on the timeline too.
- DMs with the AI teammate are stored, with a notice that replies come in a later phase.

**Fixes**

- The rich-text editor now emits plain JSON. ProseMirror attrs are null-prototype objects and reached server actions as unreadable references, so any document with a mention or a heading failed to save, comments included.
- Notification preference switches now survive an immediate reload (the write is tracked like every other mutation).

**Tests**

- Vitest: the chat policy, channels, messages, unread and read positions, notifications and the digest. 192 tests in total.
- Playwright: a mention reaching the Inbox live and triaged by keyboard, unread counts across tabs, preferences, a new channel with a thread, reaction and work item, two people with live messages and typing, and 30 s offline with missed messages replayed without a reload. Specs wait on `<html data-realtime>` instead of sleeping.
- Decisions D-080 to D-091.

## Phase 3: Intake (2026-09-29)

**Triage queue** (`/<ws>/p/<IDENT>/intake`)

- Pending, Snoozed, Accepted, Declined and Duplicates tabs with counts, and a sidebar badge with the number waiting.
- A peek with a decision bar: accept (state, priority, assignees, labels), decline (reason, notify the sender), mark as a duplicate of an existing item, snooze (presets or a date). Shortcuts `Y`, `N`, `U`, `Z`, plus `J`/`K`; the next request opens after a decision.
- Accepting gives the item the next number; declined and duplicate requests never use one and can be reopened. A snoozed request comes back on its own and its snoozer is notified.
- Every request shows who sent it, how, and their answers ("External": untrusted for the AI teammate). Accepted items keep that panel.

**Replying to the sender**

- The comment box on a request switches between an internal note and a public reply. Public replies email the sender (contacts get a fresh status link; guests also get an Inbox notification). Internal notes never reach guests or the status page.

**Public forms**

- A form builder per project: fields (short and long text, single and multiple choice, date, file, email, checkbox), required, help text, placeholders, reordering, mapping to title, description, priority, type, labels or due date, a live preview, publish and unpublish, the public address, and settings (defaults, who's notified, Turnstile, allowed embed sites, file limits).
- `/f/<slug>`: a cached public page with success and error states. Every form asks for the sender's email and name; senders become contacts.
- Embeds: an `<iframe>` snippet and `embed.js` (a floating button that opens the form in a modal, sized over `postMessage`), both with copy buttons. A form can restrict which sites may send it.
- Spam protection: a honeypot, a minimum fill time, per-IP and per-email rate limits, optional Turnstile and blocked contacts. Uploads are size and type checked and quarantined until the submission that claims them commits.

**Status page and guests**

- The confirmation email links to `/s/<token>`: a simplified status (Received, In progress, Resolved, Closed, Already reported), the sender's own answers and files, the public conversation, and a reply box with attachments.
- Guests get **Requests**: send a request to a project they belong to and follow it with the same view.

**Contacts** (`/<ws>/contacts`)

- A list with search, and a page per contact with details, notes and their requests. Block and unblock; admins merge duplicates.

**Discord webhooks** (Settings → Integrations)

- Add a webhook with its events, projects and whether content is included; send a test message; a delivery log with redelivery.
- The worker posts Discord embeds with mentions disabled, coalesces quick edits to one item into one message, honours 429s and disables a webhook after 10 failures in a row (admins are notified).

**Under the hood**

- `withMutation` also covers public actors (contacts) and queues webhook deliveries in the same transaction. Notifications go through one `notify()` helper with preferences, grouping and realtime badge events.
- New worker jobs: `webhook.deliver`, `snooze.wake`; `maintenance.prune` also drops old deliveries and abandoned uploads.
- Seed: an IT-support form, a draft server-request form, contacts and requests in every triage state.
- Decisions D-071 to D-079.

**Tests**

- Vitest: intake services (numbering, spam rules, the 21st submission from one IP gets 429, oversized and wrong-type uploads, claiming only your own uploads, status tokens, internal comments never reaching guests or the status page), webhooks (coalescing, URL allowlist, encryption), the Discord renderer, form validation, the policy additions, and the worker's delivery job (429, auto-disable).
- Playwright: build and publish a form; submit it from an embed on another origin and accept it; follow the confirmation email to the status page and reply; a guest's request with public and internal comments.

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
