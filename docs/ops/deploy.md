# Deploying Dopl

This guide takes a fresh Linux server to a running Dopl at `https://dopl.vtk.be` with nightly backups. Everything runs in Docker from images that CI publishes on every push to `main` (`ghcr.io/d1ff1cult0/dopl-{web,worker,migrate}`, public, amd64 and arm64). Nothing is built on the server.

Tested end to end on 2026-09-29 against the published images: migrations, bootstrap, invite acceptance, forced 2FA enrolment, a project and an item with an attachment, an invite email over SMTP, a backup, a restore, and `./dopl` itself.

## What you need

- A Linux server with **Docker Engine 24+** and the **compose plugin** (`docker compose version`). 2 CPU cores and 4 GB RAM are plenty for the IT team; add disk for uploads and backups.
- A **DNS record** `dopl.vtk.be` pointing at the server.
- **HTTPS**: either the bundled Caddy (ports 80 and 443 free on the server), or your own reverse proxy.
- **Outgoing email.** Accounts are invite-only (D-050), so nobody can join until invites arrive. The plan is the Google Workspace SMTP relay (D-036); any SMTP server works.

## 1. Get the files

Only the `dopl` script, `docker/` and the env templates are used on the server; cloning the repository is the easiest way to get them and to update later.

```bash
git clone https://github.com/d1ff1cult0/dopl.git /opt/dopl
cd /opt/dopl
```

## 2. Configure

```bash
cp .env.production.example .env
PW=$(openssl rand -hex 24)
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PW|" .env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://dopl:$PW@postgres:5432/dopl|" .env
sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env
sed -i "s|^DOPL_ENCRYPTION_KEY=.*|DOPL_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
chmod 600 .env
```

Then edit `.env`:

| Setting                                         | What to put                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`, `BETTER_AUTH_URL`                    | `https://dopl.vtk.be` (both the same, no trailing slash)                                                                                                                                                                                                                                                                                                                                                        |
| `DOPL_CADDY`, `DOPL_DOMAIN`                     | `true` and `dopl.vtk.be` to let Dopl's own Caddy handle HTTPS; `false` with your own proxy (§4)                                                                                                                                                                                                                                                                                                                 |
| `SMTP_*`, `MAIL_FROM`                           | **Google Workspace SMTP relay:** Admin console → Apps → Google Workspace → Gmail → Routing → **SMTP relay service**: allow your server's public IP (or require SMTP AUTH), TLS required. Then `SMTP_HOST=smtp-relay.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false` (STARTTLS), `MAIL_FROM="Dopl <noreply@vtk.be>"`. With SMTP AUTH, set `SMTP_USER`/`SMTP_PASSWORD` (an app password of the sending account). |
| `STORAGE_DRIVER`                                | Keep `local`: uploads live in the `uploads` volume and are included in the backups. `s3` works with Garage or any S3-compatible store (fill in `S3_*`).                                                                                                                                                                                                                                                         |
| `BACKUP_TIME`, `BACKUP_KEEP_DAYS`, `BACKUP_DIR` | When the nightly backup runs, how long to keep it, and where it lands (default `docker/backups/`)                                                                                                                                                                                                                                                                                                               |
| `DOPL_VERSION`                                  | `latest`, or a commit SHA to pin a version (recommended once you're live)                                                                                                                                                                                                                                                                                                                                       |

**Keep a copy of `.env` somewhere safe** (a password manager). `DOPL_ENCRYPTION_KEY` decrypts stored webhook URLs and SSO secrets; `BETTER_AUTH_SECRET` signs sessions; the database password is in there too. A backup without them can still be restored, but those secrets would have to be re-entered and everyone signed in again.

The mailbox, the AI teammate and Google sign-in need more; they're optional and come later (§8). Their worker-only secrets go in `worker.env` (from `worker.env.example`) and `docker/secrets/`, never in `.env` (D-027).

## 3. Start

```bash
./dopl up
./dopl status
```

`up` starts Postgres, runs the migrations (the `migrate` container exits when done), fixes the uploads volume's owner, then starts `web` (on `127.0.0.1:3000`), `worker` and `backup`, plus Caddy when `DOPL_CADDY=true`. `web` and `worker` report `healthy` after about 20 seconds.

Check it: `curl -I http://127.0.0.1:3000/sign-in` answers `200`; with Caddy, `https://dopl.vtk.be/sign-in` does.

## 4. Reverse proxy (if you have your own)

With `DOPL_CADDY=false`, proxy `https://dopl.vtk.be` to `http://127.0.0.1:3000` (`DOPL_PORT`). **Two paths stream server-sent events and must not be buffered:** `/api/v1/<workspace>/realtime` and `/api/mcp`.

Caddy:

```caddyfile
dopl.vtk.be {
	@stream path_regexp stream ^/api/(v1/[^/]+/realtime|mcp)$
	reverse_proxy @stream 127.0.0.1:3000 {
		flush_interval -1
	}
	reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
location ~ ^/api/(v1/[^/]+/realtime|mcp)$ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 1h;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 30m;   # attachments up to 25 MB
}
```

The proxy must pass `X-Forwarded-For`: rate limits on sign-in and public forms use the client IP.

## 5. First run

```bash
./dopl bootstrap you@vtk.be "Your Name"
```

This creates the workspace (`VTK IT` at `/vtk`; change with `--workspace "…" --slug …`) and prints a one-time **owner invite link**, valid for 7 days. Open it, choose a password, and Dopl asks you to **set up two-factor authentication** right away (owners and admins with a password must, D-050): scan the QR code with an authenticator app, **save the backup codes**, and enter a code.

Then:

1. **Settings → General:** the workspace name and time zone.
2. **Settings → Members → Invite people:** your teammates. Each gets an email; if it doesn't arrive, see §9. Admins need 2FA too; members and guests don't.
3. **All projects → New project:** e.g. `INFRA`, `HELP`. Each gets a chat channel.
4. Optional: **Settings → Integrations** (Discord webhooks), **HELP → Intake** (a public request form at `/f/<slug>`).

## 6. Backups

The `backup` container runs every night at `BACKUP_TIME` and writes to `docker/backups/`:

- `dopl-<date>-<time>.dump`: the whole database (`pg_dump` custom format)
- `uploads-<date>-<time>.tar.gz`: the uploads volume

Files older than `BACKUP_KEEP_DAYS` are deleted. **Copy the directory off the server** with what you already use (restic, rsync to a NAS, borg…), and keep `.env` with it. Make one now to check: `./dopl backup`.

**Restore** (for example on a new server, after steps 1–3 with the same `.env`):

```bash
ls docker/backups
./dopl restore dopl-20260930-033000.dump uploads-20260930-033000.tar.gz
```

It asks for confirmation, stops `web` and `worker`, replaces the database and the uploads, and starts everything again. Restoring was tested with the published images. Test it yourself once, on a spare machine, before you need it.

## 7. Updating

```bash
cd /opt/dopl
git pull              # the dopl script, compose file and templates
./dopl update         # pulls the latest images, migrates, restarts
```

To pin a version, `./dopl update <commit-sha>` (it writes `DOPL_VERSION` to `.env`); roll back the same way with an older SHA. Migrations only move forward, so restore the backup made before an update if you ever need to go back across a migration. Check that CI finished its image build for the commit first (GitHub → Actions → the `images` job).

After an update, compare `.env.production.example` with your `.env` for new settings (`git log -p .env.production.example`).

## 8. Later: mailbox, AI teammate, Google sign-in, SSO

None of these are needed to start. Each has its own guide:

- **Shared mailbox** (`it@vtk.be` in Dopl): a Google Cloud project, a service account with domain-wide delegation and a Pub/Sub topic: `docs/ops/gmail-setup.md` (Q-16, Q-20).
- **AI teammate** (Hermes + Warpgate): `docs/ops/agent-setup.md`. It stays off until you turn it on.
- **Google sign-in:** an OAuth client in the same Google Cloud project; set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in `.env`, redirect URI `https://dopl.vtk.be/api/auth/callback/google`, then `./dopl up`.
- **SSO (OIDC/SAML):** Settings → Authentication, once the identity provider is chosen (Q-21).

Worker secrets for these go in `worker.env` next to `.env` and key files in `docker/secrets/` (mounted read-only into the worker only).

## 9. When something's wrong

| Symptom                                  | Look at                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invite or magic-link emails don't arrive | `./dopl logs worker` (look for `email.send`). With the Google relay: is the server's public IP allowed, and is `MAIL_FROM` a domain in your Workspace? Settings → Members → Resend.                                                                                                                           |
| `web` or `worker` restarts over and over | `./dopl logs web` / `worker`: a missing or invalid `.env` value is named in the first lines (both refuse to start without the required settings).                                                                                                                                                             |
| `migrate` fails                          | `./dopl logs migrate`. Usually the database password in `DATABASE_URL` doesn't match `POSTGRES_PASSWORD`. The password is fixed when the volume is first created; changing it later needs `ALTER USER` inside Postgres.                                                                                       |
| Pages load but nothing updates live      | The reverse proxy buffers `/api/v1/<ws>/realtime` (§4).                                                                                                                                                                                                                                                       |
| Attachments fail to upload               | `./dopl logs web`. With `local` storage, `./dopl up` fixes the volume's owner; with a proxy, `client_max_body_size` (nginx).                                                                                                                                                                                  |
| Locked out of 2FA                        | Use a backup code. Otherwise reset it in the database, and the person enrols again at the next sign-in: `./dopl compose exec postgres psql -U dopl -d dopl -c "DELETE FROM two_factors WHERE \"userId\"=(SELECT id FROM users WHERE email='…'); UPDATE users SET \"twoFactorEnabled\"=false WHERE email='…'"` |
| Everything is slow                       | `docker stats`; Postgres and the web app use most memory.                                                                                                                                                                                                                                                     |

Logs are JSON (pino); `./dopl logs worker | grep -v '"level":30'` shows only warnings and errors. Both apps have health checks (`./dopl status`); the worker's is on port 3001 inside its container.
