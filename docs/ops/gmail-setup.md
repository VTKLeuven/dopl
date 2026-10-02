# Connecting a Google Workspace mailbox

This guide is for the Google Workspace admin who connects the team's shared mailbox (for example `it@vtk.be`) to Dopl. You do it once. After that, workspace admins add or change mailboxes in **Settings → Mailboxes**.

Dopl reads only the mailboxes someone connects: the shared ones an admin connects, and a person's own work mailbox when that person connects it themselves (§6). Only the worker container holds the Google key; the web app, which faces the internet, never sees it (D-027).

**What you need:** a Google Cloud project you can administer, and super-admin rights in the Google Workspace admin console.

## 1. The mailbox itself

The Gmail API reads **user mailboxes**, not Google Groups. If your IT address is a group, pick one of these:

- **Make it a real mailbox.** Turn `it@vtk.be` into a licensed user account.
- **Keep the group, add a member mailbox.** Create a user such as `it-inbox@vtk.be`:
  1. Add it to the group, with delivery set to _All email_.
  2. Connect `it-inbox@vtk.be` in Dopl.
  3. So replies still come from the group address, add `it@vtk.be` as a _Send mail as_ alias in that mailbox's Gmail settings (Settings → Accounts → Send mail as), and verify it. Dopl treats mail from any send-as alias as your own.

## 2. A service account with domain-wide delegation

1. In the [Google Cloud console](https://console.cloud.google.com/), pick or create a project (for example `dopl-vtk`).
2. **APIs & Services → Library:** enable the **Gmail API** and the **Cloud Pub/Sub API**.
3. **IAM & Admin → Service accounts → Create service account:** name it `dopl-worker`. It needs no project roles.
4. Open the service account → **Keys → Add key → Create new key → JSON**. Download the file. Treat it like a password.
5. On the service account's **Details** tab, copy the **Unique ID** (a long number): this is the OAuth client ID.
6. In the [Workspace admin console](https://admin.google.com/): **Security → Access and data control → API controls → Manage domain-wide delegation → Add new**:
   - **Client ID:** the unique ID from step 5
   - **OAuth scopes:**

     ```
     https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.modify
     ```

   - To **reply from Dopl** (Phase 7b), also add `https://www.googleapis.com/auth/gmail.send`, then turn on **Reply from Dopl** on the mailbox's settings page.

Delegation lets the worker act as the mailbox with only those scopes. Changes can take a few minutes to apply.

## 3. Push notifications (Pub/Sub)

Without push, Dopl checks each mailbox every 5 minutes. With push, new mail shows up within seconds.

1. **Pub/Sub → Topics → Create topic:** `gmail-dopl`. Note its full name, `projects/<project>/topics/gmail-dopl`.
2. On the topic, **Permissions → Add principal:**
   - principal: `gmail-api-push@system.gserviceaccount.com`
   - role: **Pub/Sub Publisher**

   Gmail publishes as that account.

3. **Subscriptions → Create subscription** on that topic:
   - name: `gmail-dopl-worker`
   - delivery type: **Pull**
   - acknowledgement deadline: 60 s
   - retention: 1 day is plenty

   Its full name is `projects/<project>/subscriptions/gmail-dopl-worker`.

4. On the subscription, **Permissions → Add principal:** the `dopl-worker` service account, role **Pub/Sub Subscriber**.

Dopl pulls from the subscription, so it needs no public webhook. The worker renews each mailbox's `users.watch` every night; a watch lasts 7 days.

## 4. Give the key to the worker

On the Dopl host:

```bash
mkdir -p docker/secrets && chmod 700 docker/secrets
cp ~/Downloads/dopl-vtk-*.json docker/secrets/google-sa.json
chmod 600 docker/secrets/google-sa.json
cp worker.env.example worker.env
```

Then fill in `worker.env`:

```bash
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/run/secrets/google-sa.json
GMAIL_PUBSUB_TOPIC=projects/<project>/topics/gmail-dopl
GMAIL_PUBSUB_SUBSCRIPTION=projects/<project>/subscriptions/gmail-dopl-worker
```

`docker/compose.prod.yml` mounts `docker/secrets` read-only into the **worker only** and loads `worker.env` for the worker only. Restart it with `docker compose -f docker/compose.prod.yml up -d worker`. Don't put these variables in `.env`: the web app refuses to start if it sees the key's path.

## 5. Connect the mailbox in Dopl

As a workspace admin: **Settings → Mailboxes → Connect a mailbox.**

1. Enter the address, a display name, how many days to import (90 is a good start) and who reads it.
2. The worker runs a **connection test**. It gets a token for the mailbox and lists its labels; you see the result on the mailbox's page.
3. It then **imports** the chosen window (resumable) and starts push.

The status page shows:

- the last sync
- the push expiry
- the last 20 runs with their results
- the reason when something fails

It also has buttons to test the connection again, sync now, pause and resume.

## 6. Personal mailboxes

Each team member can also connect **their own** work mailbox in **Settings → My mailbox** (D-138). It uses the same service account, delegation and Pub/Sub subscription, so there is nothing more to set up.

- Only the address a person signs in with can be connected; they can't type another one. Delegation could open any mailbox in the domain, so this is the guard.
- Only that person sees its mail: not their teammates, not workspace admins, not the AI teammate. It never posts to Discord or adds contacts. Connecting and disconnecting are in the audit log (the address, not the mail).
- **Group mail isn't tracked twice.** A person on the `it@vtk.be` group gets the team's mail in their own mailbox too. Mail addressed to a shared mailbox or one of its send-as aliases (the worker records them at every sync), mail a Google Group passed on for such an address, and any copy of a message a shared mailbox already holds stays out of the personal mailbox. If the personal mailbox happened to sync first, the shared mailbox takes the message over when its copy arrives.
- When an admin deactivates someone, their mailbox is paused; deleting the account deletes it.

If people sign in with an address outside your Google Workspace, their connection test fails with `unauthorized_client` or "token is for…".

## Troubleshooting

| Symptom                                    | Likely cause                                                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connection test: `unauthorized_client`     | Delegation isn't set up, or the scopes don't match exactly (commas, no spaces). Wait a few minutes after changing them.                             |
| Connection test: "token is for … not …"    | The address in Dopl differs from the mailbox the token is for, often a group address. Connect the member mailbox (§1).                              |
| New mail only every 5 minutes              | Push isn't working. Check the topic's publisher permission for `gmail-api-push@system.gserviceaccount.com`, and the worker's subscriber permission. |
| "Full resync" in the sync log              | Gmail's history expired (after a long pause). Dopl re-imports the window; conversations are never duplicated.                                       |
| Replies fail with "Replying is turned off" | Turn on **Reply from Dopl** for the mailbox, after adding the `gmail.send` scope.                                                                   |
