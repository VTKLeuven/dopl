# Phase 4 notes: Inbox & messages

Written by the Phase 4 agent for the lead, who merges this branch and folds these notes into `CHANGELOG.md`, `ROADMAP.md`, `DECISIONS.md` and `OPEN_QUESTIONS.md`.

- **Branch:** `worktree-agent-a20faff64fa7bf3d3`
- **Based on:** `bcbfe5f` (`claude/busy-carson-df4rha`, the Phase 3 intake domain), not on `main`. The branch relies on Phase 3's `notify()` and its new enum values.

---

## 1. CHANGELOG entry (draft)

### Phase 4: Inbox & messages

**Realtime**

- One stream per browser. Tabs elect a leader with the Web Locks API, and the leader relays events to the other tabs over a `BroadcastChannel`.
  - When the leader closes, the next tab takes over and resumes from the last event id any tab has seen (`?since=`).
  - A watchdog reopens a dead stream: the keepalive is now a named `ping` event, and the stream also reopens when the browser comes back online.
- Ephemeral events (typing) go over a second `LISTEN` (`dopl_ephemeral`). They are never stored, never replayed, and pass the same per-connection permission check as stored events.
- `channel:<id>` topics follow the chat policy.
- Live events that arrive during a `Last-Event-ID` replay are held back, then delivered after it without duplicates.

**Notifications**

- Subscribers are notified of state changes, grouped into one row per item with a "N updates" count.
- Update notifications now carry the item's identifier.
- Mentions and thread replies in chat reach the Inbox.
- Hooks are ready for email assignment and mentions (Phase 7) and for agent approvals (Phase 8).
- Settings → Notifications has per-type Inbox and email switches.
- The new `email.digest` job runs every 10 minutes. It sends one `inbox.digest` email per person with their unread notifications that haven't been emailed yet.

**Inbox** (`/[ws]/inbox`)

- A 380 px list next to a reader. The reader shows:
  - the work item, using the same detail component as the peek
  - the chat thread, for message notifications
  - a short card with a link, for everything else
- All/Unread views, a type filter, and Snoozed and Archived views.
- Opening a notification marks it read.
- Archive, snooze presets and read/unread work on a row, in the reader, or on a selection. All are optimistic with rollback, and archive has an undo toast.
- Keyboard: J/K move and open, X selects, E archives, U toggles read, Z snoozes, Esc clears. `G I` goes to the Inbox and `G M` to Messages.
- Unread badge in the sidebar and a "(n)" prefix in the tab title, both realtime.

**Messages** (`/[ws]/messages`)

- Conversation types: project channels, public and private custom channels, and DMs and group DMs.
- Unread tracking: bold, a dot, or a count, plus @mention counts.
- Threads in a side panel, with follow/unfollow.
- The composer supports @mentions, `#INFRA-42` chips (state icon and title), reactions, attachments (paste or drop), edit, and delete with undo.
- Typing indicators disappear within about 4 s of stopping.
- "Create work item from message" makes the item plus a `CREATED_FROM` reference. The reference shows as a chip under the message and on the item's timeline, and `#item` mentions show there too.
- DMs with the AI teammate are stored and carry a notice that replies come later.

**Fix:** the rich-text editor now emits plain JSON.

- ProseMirror attrs are null-prototype objects, so they reached server actions as unreadable temporary references.
- As a result, any document containing a mention (or a heading) failed to save. This also affected comments.

---

## 2. ROADMAP status block (draft)

**Phase 4: built, awaiting review.**

- [x] Realtime: BroadcastChannel leader tab, ephemeral events, channel topic access, the inbox and messages cache mapping, Caddy `flush_interval -1` documented (§8).
  - The SSE endpoint, LISTEN, replay and fan-out were already built in Phase 2.
- [x] Notifications:
  - mentions, assignments, state changes of subscribed items, comments, thread replies
  - intake (from Phase 3)
  - hooks for agent approvals and email assignment
  - groupKey grouping, preferences, email digests
- [x] Inbox UI: list and reader, filters, read/unread, archive, snooze, bulk actions, keyboard, realtime badge and title.
- [x] Messages:
  - project, custom and DM channels
  - threads, mentions, reactions, attachments
  - `#INFRA-42` previews
  - create work item from message (CREATED_FROM on the timeline)
  - unread tracking, typing indicators
- **Accept:**
  - [x] Two browsers see each other's messages within about 1 s (e2e checks under 2 s).
  - [x] After 30 s offline, missed events replay without a reload (e2e).
  - [x] A mention reaches the Inbox with its badge (e2e checks under 3 s; typically about 300 ms).
  - [x] Unread counts are correct across tabs (e2e).
  - [x] Typing indicators disappear within 5 s (e2e).

**Deviations**

- Guests have no team chat at all, not even DMs (see decision 1).
- Thread replies are counted per thread (ThreadFollower + the Inbox), not in the channel's unread count.
- Notifications are created directly in the mutation's transaction through `notify()`. The `notifications.fanout` job is not used; this is Phase 3's design, kept as is.

**Carried over**

- Flashing changed fields on realtime updates (DESIGN_SYSTEM §7.2).
- Per-channel mute and `notifyLevel`.
- Per-project preference overrides in the UI. The data model, `notify()` and the digest already honour project rows.
- `DUE_SOON` notifications: no job produces them yet.
- Chat search.
- Image previews: attachments show as file chips.
- A fuller emoji picker: six quick reactions for now.
- `?msg=` only jumps to a message if it is within the loaded pages.
- Chat seed data. Screenshots used a local dataset; a seed module would help demos.
- `/dev/ui` sections for inbox and chat, and Playwright visual baselines.
- Mobile layouts are built (the list/reader switch and the conversations/conversation switch) but have no screenshots.
- Agent replies in DMs (Phase 8).

---

## 3. Decision drafts (unnumbered)

1. **Team chat is for members; guests get none.**
   - Context: guests are outsiders with per-project access.
   - Decision: `canChannel` denies guests everything, including DMs. Project channels follow project access (Member/Admin role in the project). Public channels are open to every non-guest member. Private channels and DMs are open only to their members. Workspace admins manage public channels but get no backdoor into private ones.
   - Why: chat is internal and informal. A guest's window into the team is their own requests.

2. **Project channels have lazy membership rows.**
   - Decision: a `ChannelMember` row appears the first time someone reads or posts, to hold `lastReadAt`. Without a row, unread counts start from when the person joined the workspace.
   - Why: projects already define who can see the channel, so duplicating that in rows would drift.

3. **What counts as unread, and what reaches the Inbox.**
   - Unread is the number of top-level messages from others that are newer than `lastReadAt`.
   - Posting reads the channel up to your own message.
   - `lastReadAt` only moves forward (`GREATEST`), which protects against another tab reporting an older position.
   - Only @mentions and replies in threads you follow create notifications. Plain channel traffic and DMs show in the Messages sidebar only.
   - Reading a channel marks its mention notifications read, and opening a thread marks its replies and mentions read.
   - Thread replies are grouped per thread (`groupKey thread:<rootId>`).
   - Why: this is the Slack/Linear split. The Inbox stays about you, and the sidebar is about conversations.

4. **`dmKey` is `<workspaceId>:<sorted participant ids>`.**
   - Why: the column is globally unique, and the same two people can share several workspaces.
   - One DM or group DM exists per set of people. A closed DM reopens for everyone when someone writes in it.

5. **Personal state writes no Activity.**
   - This covers read, archive, snooze, preferences, reactions and read positions.
   - These changes still run in `withMutation` and emit `user:<id>` events.
   - Channel and message lifecycle does write Activity: `CHANNEL` created/updated/joined/left/members, and `MESSAGE` posted/edited/deleted.

6. **Typing uses a route handler and ephemeral NOTIFY.**
   - The route is `POST /api/v1/[ws]/channels/[id]/typing`, with an origin check.
   - Server actions run one at a time per client, so a ping could delay sending the message itself.
   - Clients ping every 2.5 s while the composer has text, and receivers expire an indicator 4 s after the last ping. A `stop` ping, or the person's message arriving, clears it at once.

7. **Leader tab via the Web Locks API.**
   - `navigator.locks` elects the leader and `BroadcastChannel` relays events. Browsers without them fall back to one stream per tab.
   - `SharedEventSource` is an EventSource-shaped facade, so the provider's code barely changed.
   - The server holds live events back during a replay. This removes the duplicates and reordering that the old code allowed.

8. **Email digest rules.**
   - Runs every 10 minutes and looks at notifications from the last 24 h.
   - A 2-minute grace period skips notifications that are too fresh; someone may be reading them in the app.
   - Only unread, un-emailed, non-snoozed notifications are included.
   - Email preference: a project row beats a workspace row, and the default is off.
   - Rows are claimed with `emailedAt` in the same transaction that inserts the outbound email and its `email.send` job, so overlapping runs can't send twice.
   - A grouped notification with new activity gets `emailedAt` reset by `notify()` and can appear in a later digest.

9. **Notification links are shared code.**
   - `@dopl/shared/domain/notifications` computes paths and the English digest lines, so the Inbox and the email always agree.
   - The web Inbox renders its own translated text.

10. **Mentions and references respect channel access.**
    - A mention only notifies people who can read the channel.
    - `#INFRA-42` creates a `MENTIONED` reference, and "create from message" creates a `CREATED_FROM` reference.
    - A reference only shows on an item's timeline to readers who can open its channel, so a private channel never leaks through an item everyone can see.

11. **Sidebar indicators use their own query keys and mount only on the client.**
    - Keys: `["inbox", ws, "counts", "badge"]` and `["chat", ws, "channels", "dot"]`. Invalidating the parent key by prefix refreshes both.
    - Why: the sidebar and the page sit in different Suspense boundaries. A query created by one (even an empty pending one) made TanStack's `HydrationBoundary` defer the other's prefetched data to an effect, which caused hydration mismatches.

---

## 4. Open questions

- Should DMs (not only mentions) create Inbox notifications, as Slack does? The current default is no: DMs show an unread count in the sidebar.
- Should email be on by default for mentions and assignments? The current default is off for every type (`NotificationPreference.email` defaults to false).
- Should guests really never get chat, not even DMs with the team?
- How long should chat messages be kept? This is related to Q-11 retention.

---

## 5. Merge notes for the lead

**Migrations:** none. The schema is unchanged; `pnpm db:drift` is empty.

**New queue:** `email.digest`, scheduled `*/10 * * * *` in the worker. `ensureQueues` creates it.

**New env vars:** none.

**Maintenance:** `maintenance.prune` also deletes chat uploads that were never sent (PENDING, no message, older than 2 days).

**Shared files touched** (edits kept small and localized):

| File                                                        | Change                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/components/shell/sidebar.tsx`                 | Inbox (badge) and Messages (dot) items after Home; a new optional `canChat` prop; separate import lines                                                                                                      |
| `apps/web/src/app/(app)/[ws]/sidebar-loader.tsx`            | Passes `canChat`                                                                                                                                                                                             |
| `apps/web/messages/en.json`                                 | Insertions only. New namespaces `inbox`, `messages`, `notificationSettings` go before `"views"`. Shortcut labels go after `goSettings`, and the `inbox`/`messages` scopes after `global`, all in `shortcuts` |
| `apps/web/src/features/realtime/realtime-provider.tsx`      | `new EventSource(...)` becomes `new SharedEventSource(ws)`, plus three lines that add inbox/messages invalidations to the batch                                                                              |
| `apps/web/src/features/work-items/item-detail.tsx`          | Timeline merges `item.references` (6 lines)                                                                                                                                                                  |
| `apps/web/src/features/work-items/types.ts`                 | `ReferenceView`; `WorkItemDetail.references`                                                                                                                                                                 |
| `apps/web/src/lib/shortcuts/registry.ts`                    | `inbox` and `messages` scopes and their ids; `goInbox`, `goMessages`                                                                                                                                         |
| `apps/web/src/components/shell/global-shortcuts.tsx`        | `G I` and `G M`; `SCOPE_ORDER`                                                                                                                                                                               |
| `apps/web/src/app/(app)/[ws]/settings/settings-nav.tsx`     | Notifications entry under "You"                                                                                                                                                                              |
| `apps/web/src/components/editor/*`                          | `submitOnEnter`, the plain-JSON `onChange` (fixes @mentions in comments too), and `renderItemRef`                                                                                                            |
| `apps/web/src/server/notifications/notify.ts`               | `emailThreadId` and `agentApprovalId` inputs; a grouped row now points at the latest `messageId`                                                                                                             |
| `apps/web/src/server/services/work-items.ts`                | State change notifies subscribers (guests excluded); identifiers in update notifications; `createOne` exported                                                                                               |
| `apps/web/src/server/queries/work-items.ts`                 | `references: await loadItemReferences(...)`                                                                                                                                                                  |
| `apps/web/src/server/services/attachments.ts`               | Downloads of chat attachments check channel access                                                                                                                                                           |
| `apps/web/src/server/realtime/*` and the realtime route     | Ephemeral LISTEN, channel access, the replay/live ordering fix, and the `ping` event                                                                                                                         |
| `apps/worker/src/jobs/index.ts`                             | `email.digest` schedule and handler; the prune line for stale chat uploads                                                                                                                                   |
| `apps/worker/src/jobs/webhooks.ts`                          | Prettier only; it failed `prettier --check`                                                                                                                                                                  |
| `packages/shared/src/policy/index.ts`                       | `canChannel` (tests are in a new file, `channels.test.ts`)                                                                                                                                                   |
| `packages/shared/src/jobs/queues.ts`, `emails/templates.ts` | `email.digest`; the `inbox.digest` template                                                                                                                                                                  |

**Things worth knowing**

- In this container the installed Chromium (build 1194) doesn't match the build `@playwright/test` expects. I ran the specs with a local, uncommitted config that sets `use.launchOptions.executablePath = "/opt/pw-browsers/chromium"` and `webServer: undefined`, plus `E2E_BASE_URL=http://localhost:3004`. CI is unaffected.
- The e2e specs use Chloé (`chloe@dopl.test`) as the second person, because Ann is asked to enrol in 2FA. They write only into the "E2E sandbox" project channel and into new `e2e-*` channels.
- As instructed, I ran only my own specs, not the whole e2e suite.

---

## 6. Caddy: SSE needs `flush_interval -1`

The realtime route streams server-sent events. Caddy buffers proxied responses by default, which delays events until a buffer fills. Turn buffering off for that route:

```caddyfile
dopl.vtk.be {
	@realtime path_regexp realtime ^/api/v1/[^/]+/realtime$
	reverse_proxy @realtime web:3000 {
		flush_interval -1
	}
	reverse_proxy web:3000
}
```

The route already sends `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, and a `ping` event every 20 s keeps idle proxies from closing the connection.
