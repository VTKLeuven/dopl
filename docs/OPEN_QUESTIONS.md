# Dopl: open questions

Each question has my **proposed default**. Wherever that works for you, a reply like "Q-5, Q-6: defaults OK" is enough. The questions are grouped by when the answer is needed.

## Answered (2026-09-29)

| #              | Answer                                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1            | Plane pain points: (1) no email tracking, (2) no feedback forms in the Community Edition, (3) done items can't be filtered away in a project's item overview. Now in PROMPT.md and D-053. |
| Q-2            | **Invite-only** for everyone (D-050).                                                                                                                                                     |
| Q-3            | **Google Workspace SMTP relay** (D-036).                                                                                                                                                  |
| Q-4            | **Public**, at `dopl.vtk.be` (D-051).                                                                                                                                                     |
| Other defaults | "All choices seem good": defaults apply to every question you haven't answered. Prisma 8 was requested if available; it isn't GA yet (D-049).                                             |

New requirements: Discord webhooks (D-052) and Better Auth email+password logins and/or SSO (D-050).

## Needed before or early in Phase 1

**Q-1: What should we do better than Plane?**
The brief's section "What we want to do better than Plane" still has its placeholder. Which specific Plane problems should we solve, one bullet each? They'll become design goals with acceptance tests, and they may change Phase 1/2 priorities.
_Default:_ treat the four principles (fast, keyboard-first, few clicks, one place) as the full list.

**Q-2: Member sign-in.**
(a) Which Google Workspace domain(s) may sign in as members?
(b) Should any user from those domains be **auto-added as a Member** on first sign-in, or is it **invite-only**?
_Default:_ one domain, auto-join as Member (`autoJoinDomainUsers = true`). An Owner promotes admins.

**Q-3: Outbound email provider** for magic links, intake confirmations, notifications and digests.
Options: the Google Workspace SMTP relay, Brevo (I noticed a Brevo connector in this environment), or another SMTP service. Which sender address and name should we use?
_Default:_ the SMTP abstraction (D-036) with the Workspace SMTP relay from `noreply@<domain>` as "Dopl". Development logs emails to the console.

**Q-4: Hosting and network exposure.**
(a) Which hostname will Dopl use?
(b) Should the app be reachable only on your VPN or internal network, with only the public surface (`/f/*`, `/s/*`, `/embed.js`, `/api/public/*`, plus `/api/auth/*` for guests) on the internet? Or is everything public?
(c) Is it the same host as the AI server?
_Default:_ public TLS hostname via Caddy, full app behind VPN/IP allowlist, public surface open.

## Needed by the phase noted

**Q-5 (Phase 1): Object storage.** Is Garage in the Compose stack OK, or do you already run S3-compatible storage (MinIO, Ceph, a NAS)?
_Default:_ Garage.

**Q-6 (Phase 5b): Embeddings.** Does your AI server expose an OpenAI-compatible `/v1/embeddings` endpoint? Which model, and how many dimensions?
_Default:_ a 1024-dimension model (e.g. a Qwen3-Embedding or bge-m3 class model). The column is `vector(1024)` until confirmed.

**Q-7 (Phase 8): Hermes deployment.**
(a) Where does Hermes run, and which version?
(b) Network paths: can the Dopl worker reach Hermes at `:8642`, and can Hermes reach `https://<dopl>/api/mcp`?
(c) Are you OK with **disabling Hermes's own terminal/code-execution tools**, so every infrastructure command goes through Dopl's gated `infra_exec` (D-031)? This is the only way to guarantee that "every state change needs approval", because Hermes's own approval only triggers on commands it recognises as dangerous.
_Default:_ yes to (c).

**Q-8 (Phase 8): Approvers.**
(a) Who may approve agent actions: Admins only, or also members with an "approver" flag?
(b) May someone approve a command they requested themselves?
(c) Should **production** hosts require a second person (four-eyes)?
_Default:_ Admins plus flagged members; self-approval allowed except on PRODUCTION hosts, which need a different approver.

**Q-9 (Phase 2): Pull realtime forward?** I propose building the realtime transport at the end of Phase 2 rather than in Phase 4, because collaborative views without live updates feel broken. Notifications and chat stay in Phase 4.
_Default:_ yes, move it.

**Q-10 (Phase 2): Import from Plane?** Do you need to migrate existing Plane projects, items and comments into Dopl? That would add a Plane-API-based importer task.
_Default:_ no import.

**Q-11 (Phase 1): Retention.** Is 30 days in the trash before hard delete OK? How long should we keep `audit_logs` and agent command output?
_Default:_ trash 30 days; audit log forever, with export; agent output 180 days.

**Q-12 (Phase 3): Status page wording.** Should submitters see a simplified public status (Received → In progress → Resolved / Declined) instead of internal state names?
_Default:_ simplified.

**Q-13 (Phase 4/8): The AI teammate's name.** Is it "Dopl", or does it have its own name? Any tone or personality guidance?
_Default:_ "Dopl", concise and professional, and it says when it's unsure.

**Q-14 (Phase 1): Locale.** Default timezone, week start and date format? Is a Dutch UI needed soon (it's cheap now, but still work)?
_Default:_ Europe/Brussels, weeks start on Monday, `d MMM yyyy`, English UI with all strings i18n-ready.

**Q-15 (Phase 1): Defaults per project.**
Default states:

| State       | Group     |
| ----------- | --------- |
| Backlog     | backlog   |
| Todo        | unstarted |
| In progress | started   |
| In review   | started   |
| Done        | completed |
| Cancelled   | cancelled |

Default work-item types: Task, Bug, Incident, Request, Feature.
Default estimate system: none.
Are these right for your team?
_Default:_ as listed.

**Q-16 (Phase 7): Mailboxes.** Which mailbox(es) will you connect first? Is the IT address a real user mailbox or a Google Group? What backfill window do you want, and do you want Gmail label mirroring (`Dopl/Solved`…)?
_Default:_ one mailbox, 90-day backfill, mirroring off.

**Q-17 (Phase 8): Warpgate.** Which version do you run, and how are targets named? Can we create a dedicated `dopl-agent` Warpgate user with key authentication and per-target roles? Is there a non-root, least-privilege account on the targets for it to use?
_Default:_ one Warpgate user per agent, targets referenced by name in `AgentHost.warpgateTarget`.

**Q-18 (Phase 8): Model.** Please confirm the model ("Qwen 3.8 27B"), its context window and its tool-calling reliability through your OpenAI-compatible server. This sets the prompt/context budget and whether a stricter tool-call format is needed.

**Q-19 (Phase 3): Guest visibility.** Should a guest ever see other guests' submissions in the same project, for example a shared requests board?
_Default:_ no, only their own. Project read-only browsing stays a per-project opt-in.

**Q-21 (Phase 1): SSO identity provider.** Which IdP should SSO work with: Authentik, Keycloak, Microsoft Entra, KU Leuven, or something else? Is it OIDC or SAML? Should it replace Google sign-in or sit next to it?
_Default:_ generic OIDC next to Google and email+password, configured by an Admin in Settings → Authentication.

**Q-22 (Phase 3): Discord.** Which channels should get which events, for example #it-tickets for intake and new items, and #it-mail for new threads? Should message content be included, or only titles and links?
_Default:_ titles and links only (`includeContent` off), with events chosen per webhook.

**Q-20 (Phase 1/7): Google Cloud access.** Who can create the OAuth client (for sign-in), the service account with domain-wide delegation, and the Pub/Sub topic and subscription? Does a GCP project for this exist yet? I'll write a step-by-step admin guide either way.

**Q-23 (Phase 2): Moved items' old numbers.** When INFRA-42 moves to NET and becomes NET-7, should `INFRA-42` keep resolving (links, `#INFRA-42` references, emails)?
_Default until answered:_ no alias yet. The move is recorded in the item's activity. A per-item "previous identifiers" list, like the one projects already have, would make old links redirect.

**Q-24 (Phase 2): Calendar drags and start dates.** When you drag an item with both dates on the calendar, should the start date move along to keep the duration?
_Default:_ only the date shown moves. The timeline is the place to move both.

**Q-25 (Phase 4): DMs in the Inbox.** Should direct messages (not only mentions) create Inbox notifications, as Slack does?
_Default:_ no. DMs show an unread count in the Messages sidebar only (D-082).

**Q-26 (Phase 4): Email defaults.** Should email be on by default for mentions and assignments?
_Default:_ off for every type (`NotificationPreference.email` defaults to false). People switch it on in Settings → Notifications and get a digest every 10 minutes (D-087).

**Q-27 (Phase 4): Chat for guests.** Should guests really never get chat, not even DMs with the team?
_Default:_ no chat for guests (D-080). Their requests have a public conversation instead.

**Q-28 (Phase 4): Chat retention.** How long should chat messages be kept? Related to Q-11.
_Default:_ forever, like comments. Deleted messages are soft-deleted.

**Q-29 (Phase 5): Editing shared notes.** Should teammates be able to edit a note that's shared with the team or attached to their project, or tick its checkboxes?
_Default:_ no. Shared notes are read-only for everyone but the owner, who alone can edit, share, convert and tick to-dos (the to-dos belong to the owner's "My to-dos"). A teammate who wants to act on one asks the owner to convert it, or copies the text into their own note.
