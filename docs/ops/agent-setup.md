# Setting up the AI teammate (Hermes Agent + Warpgate)

Dopl's AI teammate ("Dopl") runs on [Hermes Agent](https://hermes-agent.nousresearch.com) with your own model. Dopl talks to Hermes through its API server's **Runs API**, and Hermes talks back to Dopl through Dopl's **MCP server**. The only way the agent reaches a server is Dopl's `infra_exec` tool, which the Dopl worker executes over SSH through **Warpgate**, with human approval for anything that isn't a whitelisted read-only command (D-031).

```
member ─@Dopl─▶ web ──job──▶ worker ──POST /v1/runs, SSE──▶ Hermes ──▶ model (Qwen 3.8 27B)
                  ▲                                          │
                  └────────── MCP tools (bearer + run_token) ◀┘
worker ──ssh dopl-agent:<target>──▶ Warpgate ──▶ host   (only after allowlist or approval)
```

Answers to Q-7, Q-17 and Q-18 (2026-09-29): Hermes' own terminal and code tools are **disabled**; the worker reaches Hermes and Hermes reaches `/api/mcp`; one Warpgate user `dopl-agent` with key authentication and per-target roles; targets are referenced by name; the model is Qwen 3.8 27B with a 128k context and reliable tool calls.

## 1. Hermes

Hermes runs as its own service (MIT licence), next to Dopl or on the AI server.

**API server** (`~/.hermes/.env`):

```bash
API_SERVER_ENABLED=true
API_SERVER_HOST=10.0.0.5        # a private interface, never 0.0.0.0 on a public host
API_SERVER_PORT=8642
API_SERVER_KEY=<32+ random characters>   # also goes into Dopl's worker.env as HERMES_API_KEY
```

**`~/.hermes/config.yaml`** — the parts Dopl depends on:

```yaml
# The model: your OpenAI-compatible server with Qwen 3.8 27B.
model:
  default: qwen3.8-27b

# No shell, no code execution, no file or browser tools: every command goes
# through Dopl's infra_exec, where Dopl enforces the allowlist and approvals.
agent:
  disabled_toolsets: [terminal, code_execution, file, browser]

# If any remaining Hermes tool asks for approval, Dopl shows it as a card and
# answers "once" or "deny" (never "session" or "always").
approvals:
  mode: manual

mcp_servers:
  dopl:
    url: "https://dopl.vtk.be/api/mcp"
    headers:
      Authorization: "Bearer <MCP token from Dopl>"
    # infra_exec may wait up to 10 minutes for a human; keep the call open longer.
    timeout: 900
    connect_timeout: 30
```

Dopl's tools appear to the model as `mcp_dopl_<tool>`. The token comes from **Settings → AI teammate → MCP tokens** (shown once; only its hash is stored). Settings also shows this snippet with your URL filled in.

**Checks**

- `curl -H "Authorization: Bearer $API_SERVER_KEY" http://10.0.0.5:8642/v1/capabilities` lists `run_submission`, `run_status`, `run_events_sse`, `run_stop` and `run_approval` as `true`. Dopl refuses to use a runtime without the first four.
- In Dopl, **Settings → AI teammate → Check connection** does the same from the worker and shows the model.

**Reverse proxy:** `/api/mcp` streams progress over SSE while a tool call waits for an approval. If Hermes reaches Dopl through Caddy, add the path to the unbuffered block next to the realtime route:

```caddyfile
@stream path_regexp stream ^/api/(v1/[^/]+/realtime|mcp)$
reverse_proxy @stream web:3000 {
	flush_interval -1
}
```

## 2. Warpgate

1. **A user for the agent:** create `dopl-agent` with **public-key authentication only** (no password, no OTP needed for key auth). Generate the key on the Docker host:

   ```bash
   ssh-keygen -t ed25519 -N "" -C dopl-agent -f docker/secrets/agent_ed25519
   ```

   Add `agent_ed25519.pub` to the Warpgate user.

2. **Targets and roles:** give `dopl-agent` a role that includes only the targets the agent may use, e.g. `lab-01`, `staging-01`, `app-01`. Dopl's host allowlist is a second, independent gate: a target Warpgate allows but Dopl doesn't list is still refused before connecting.
3. **On each target:** Warpgate logs in with the target's configured account. Use a **dedicated, non-root account** (for example `dopl`) with only what the agent needs: membership of the `docker` group for container work, or a narrow `sudoers` entry. Never root, never a personal account.
4. **Host key:** Dopl pins Warpgate's SSH host key. Get its fingerprint:

   ```bash
   ssh-keyscan -p 2222 warpgate.vtk.lan 2>/dev/null | ssh-keygen -lf - | grep -i ed25519
   ```

5. **Session recording** is Warpgate's: every command the agent runs is recorded there, in addition to Dopl's audit log.

## 3. Dopl

**`worker.env`** (the worker only; the web app refuses to start with these, D-027):

```bash
HERMES_API_KEY=<API_SERVER_KEY>
WARPGATE_HOST=warpgate.vtk.lan
WARPGATE_PORT=2222
AGENT_SSH_USER=dopl-agent
WARPGATE_HOST_KEY=SHA256:…            # from step 2.4
AGENT_SSH_KEY_FILE=/run/secrets/agent_ed25519
AGENT_EXEC_TIMEOUT_SEC=300
```

`docker/compose.prod.yml` already mounts `./secrets` read-only into the worker only.

**Settings → AI teammate** (admins):

1. If there's no agent yet, **Add Dopl**. It starts **off**.
2. **Hermes API server:** `http://10.0.0.5:8642` (reachable from the worker container). **API key variable:** `HERMES_API_KEY`. **Model:** `qwen3.8-27b` (or empty for Hermes' default).
3. **Check connection**, then turn it **on**.
4. **Hosts:** add each Warpgate target with its environment. Production hosts default to "Always ask for approval".
5. **Command rules:** review the read-only allowlist and the DENY list; use **Try a command** to see what would happen. Read-only rules match the whole command and never a chained one (`;`, `&&`, `|`, `$( )`, redirects) unless the pattern spells the operator out; DENY rules also match each part of a chained command and win over approvals.
6. **MCP tokens:** create one for Hermes (all scopes, optionally limited to projects) and put it in Hermes' config.
7. **Members → Can approve agent actions** for the people (besides admins) who may approve commands.

## 4. Operating it

- **Kill switch:** the Pause switch on the Dopl page (and in Settings) stops every run within seconds, cancels pending approvals, and refuses new work and every tool call until it's turned off.
- **Stop:** any run card has Stop (the requester, approvers and admins).
- **Untrusted content:** items from forms or email, and email threads, taint a run that reads them: every command and change then needs approval, even allowlisted ones (D-033). An admin can **Mark as reviewed** on such an item.
- **Audit:** Settings → Audit log lists every approval (who, when, the exact command and host), every command started, finished or refused, pauses, token changes and rule edits. Export as CSV or JSON.
- **Timeouts:** runs time out after the profile's run timeout; approvals expire after the approval timeout; commands are killed after `AGENT_EXEC_TIMEOUT_SEC`.
- **Restarts:** a worker restart doesn't lose runs: the job is picked up again and re-attaches to Hermes, or reads the final status with `GET /v1/runs/{id}`. A command that was running when the worker died is marked "lost" (it's never re-run); check the host.

## 5. Development and CI

No Hermes or servers are needed: set `HERMES_FAKE_PORT`, `HERMES_FAKE_MCP_TOKEN` and `AGENT_EXEC_FAKE=true` in `.env` (see `.env.example`) and run `pnpm db:seed`. The worker then serves a fake Hermes that follows a tiny script (`run \`uptime\` on lab-01`, `INFRA-42`, `read the email`, `list hosts`, `create item "…" in INFRA`, `comment "…" on INFRA-42`, `ask hermes approval \`…\``) and calls Dopl's real MCP tools; commands get canned output. It's deliberately gullible: it tries commands it reads in email, which is what the approvals must stop. Production refuses to start with any of these set.
