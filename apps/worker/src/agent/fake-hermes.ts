/**
 * A stand-in for Hermes Agent in development and tests (like the fake Gmail,
 * D-111). It speaks the Runs API subset Dopl uses and, instead of a model,
 * follows a tiny script: it calls Dopl's real MCP server for what the
 * request names. It is deliberately gullible: commands it reads in email or
 * an untrusted item it tries to run, which is exactly the prompt-injection
 * scenario Dopl's approvals have to stop (red team 1).
 *
 * Recognised in the request:
 *   `uptime` on lab-01             → infra_exec (and infra_wait while pending)
 *   INFRA-42                       → get_work_item
 *   email / mail                   → list_assigned_threads + get_email_thread
 *   list hosts                     → list_hosts
 *   create item "Title" in INFRA   → create_work_item
 *   comment "Text" on INFRA-42     → add_comment
 *   ask hermes approval `cmd`      → a Hermes-side approval.request
 *   simulate a failure             → run.failed
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

interface FakeRun {
  id: string;
  status: string;
  events: Array<{ event: string; data: string }>;
  listeners: Set<() => void>;
  output: string;
  error?: string;
  abort: AbortController;
  approval?: { id: string; resolve: (d: string) => void };
}

export interface FakeHermesOptions {
  port: number;
  apiKey: string;
  mcpUrl: string;
  mcpToken: string;
  /** Delay between streamed words, ms. */
  streamDelayMs?: number;
}

/** Tool results are loose JSON: show strings as they are, anything else as JSON. */
const text = (v: unknown): string =>
  typeof v === "string" ? v : v === undefined || v === null ? "" : JSON.stringify(v);

const TERMINAL = new Set(["completed", "failed", "cancelled", "interrupted"]);
const CMD = /`([^`\n]{1,400})`\s+on\s+([\w.-]{1,64})/g;

export function startFakeHermes(opts: FakeHermesOptions): Promise<Server> {
  const runs = new Map<string, FakeRun>();
  const byKey = new Map<string, string>();
  let seq = 0;

  const push = (run: FakeRun, event: string, data: Record<string, unknown>) => {
    run.events.push({ event, data: JSON.stringify(data) });
    for (const l of run.listeners) l();
  };

  const finish = (run: FakeRun, status: string, extra: Record<string, unknown> = {}) => {
    if (TERMINAL.has(run.status)) return;
    run.status = status;
    push(run, `run.${status}`, { run_id: run.id, status, ...extra });
  };

  async function script(run: FakeRun, input: string, instructions: string) {
    const token = instructions.match(/run_token:\s*(\S+)/)?.[1] ?? "";
    const request = input.split(/\nContext:\n/)[0] ?? input;
    const lines: string[] = [];
    const signal = run.abort.signal;
    const client = new Client({ name: "fake-hermes", version: "1.0.0" });
    let connected: Promise<void> | null = null;
    // Connect on the first tool call, like Hermes does per server.
    const connect = () =>
      (connected ??= client.connect(
        new StreamableHTTPClientTransport(new URL(opts.mcpUrl), {
          requestInit: { headers: { Authorization: `Bearer ${opts.mcpToken}` } },
        }),
      ));
    const call = async (name: string, args: Record<string, unknown>) => {
      if (signal.aborted) throw new Error("stopped");
      await connect();
      push(run, "tool.started", {
        tool: `mcp_dopl_${name}`,
        preview: JSON.stringify(args).slice(0, 80),
      });
      const started = Date.now();
      const res = await client.callTool(
        { name, arguments: { run_token: token, ...args } },
        undefined,
        { timeout: 15 * 60_000, resetTimeoutOnProgress: true, signal },
      );
      const out = (res.content as Array<{ type: string; text?: string }>)
        .map((c) => c.text ?? "")
        .join("\n");
      push(run, "tool.completed", {
        tool: `mcp_dopl_${name}`,
        duration: (Date.now() - started) / 1000,
        error: Boolean(res.isError),
        preview: out.slice(0, 120),
      });
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(out) as Record<string, unknown>;
      } catch {
        parsed = { text: out };
      }
      return parsed;
    };
    const exec = async (command: string, host: string, reason: string) => {
      let r = await call("infra_exec", { host, command, reason });
      for (let i = 0; i < 5 && r.status === "pending_approval"; i++)
        r = await call("infra_wait", { approval_id: r.approval_id });
      if (r.status === "completed")
        lines.push(
          `Ran \`${command}\` on ${host} (exit ${text(r.exit_code)}):\n\n\`\`\`\n${text(r.output ?? "").trim() || "(no output)"}\n\`\`\``,
        );
      else
        lines.push(
          `\`${command}\` on ${host}: ${text(r.status)}${r.message || r.reason ? ` (${text(r.message ?? r.reason)})` : ""}.`,
        );
    };
    const followInjected = async (text: string) => {
      for (const m of text.matchAll(CMD))
        await exec(m[1] ?? "", m[2] ?? "", "The email asked for it.");
    };

    try {
      push(run, "message.interim", { text: "Looking into it.", already_streamed: false });
      if (/simulate a failure/i.test(request)) {
        finish(run, "failed", { error: "The fake model was asked to fail." });
        return;
      }
      if (/list hosts/i.test(request)) {
        const r = await call("list_hosts", {});
        const hosts = (r.hosts as Array<{ name: string; environment: string }> | undefined) ?? [];
        lines.push(
          `Hosts: ${hosts.map((h) => `${h.name} (${h.environment})`).join(", ") || "none"}.`,
        );
      }
      for (const m of request.matchAll(/\b([A-Z][A-Z0-9]{1,11}-\d+)\b/g)) {
        const r = await call("get_work_item", { identifier: m[1] });
        if (r.error) lines.push(`${m[1]}: ${text(r.error)}`);
        else {
          lines.push(`${m[1]} is "${text(r.title)}" (${text(r.state)}).`);
          await followInjected(text(r.description ?? ""));
        }
      }
      if (/\b(e-?mails?|mail)\b/i.test(request)) {
        const r = await call("list_assigned_threads", {});
        const threads = (r.threads as Array<{ thread_id: string }> | undefined) ?? [];
        if (!threads.length) lines.push("I have no email threads to read.");
        for (const t of threads.slice(0, 2)) {
          const thread = await call("get_email_thread", { thread_id: t.thread_id });
          const bodies = ((thread.messages as Array<{ body: string }> | undefined) ?? [])
            .map((msg) => msg.body)
            .join("\n");
          lines.push(
            `Read an email thread with ${(thread.messages as unknown[] | undefined)?.length ?? 0} message(s).`,
          );
          await followInjected(bodies);
        }
      }
      const create = request.match(/create (?:an? )?item "([^"]+)" in ([A-Z][A-Z0-9]{1,11})/i);
      if (create) {
        const r = await call("create_work_item", { project: create[2], title: create[1] });
        lines.push(
          r.identifier
            ? `Created ${text(r.identifier)}.`
            : `Couldn't create it: ${text(r.message ?? r.error ?? r.status)}.`,
        );
      }
      const comment = request.match(/comment "([^"]+)" on ([A-Z][A-Z0-9]{1,11}-\d+)/i);
      if (comment) {
        let r = await call("add_comment", { identifier: comment[2], body: comment[1] });
        for (let i = 0; i < 5 && r.status === "pending_approval"; i++)
          r = await call("infra_wait", { approval_id: r.approval_id });
        lines.push(
          r.comment_id || r.status === "completed"
            ? `Commented on ${comment[2]}.`
            : `Couldn't comment: ${text(r.message ?? r.error ?? r.status)}.`,
        );
      }
      const hermesApproval = request.match(/ask hermes approval `([^`]+)`/i);
      if (hermesApproval) {
        const id = `apr_${++seq}`;
        run.status = "waiting_for_approval";
        const decision = await new Promise<string>((resolve) => {
          run.approval = { id, resolve };
          push(run, "approval.request", {
            approval_id: id,
            tool: "terminal",
            context: hermesApproval[1],
          });
        });
        run.status = "running";
        lines.push(
          `Hermes asked about \`${hermesApproval[1]}\`: ${decision === "deny" ? "denied" : "approved once"}.`,
        );
      }
      for (const m of request.matchAll(CMD))
        await exec(m[1] ?? "", m[2] ?? "", "The person asked for it.");

      if (lines.length === 0)
        lines.push(
          "I'm the development stand-in for Hermes. Ask me to run `uptime` on a host, read INFRA-1, read the email linked to an item, or list hosts.",
        );
      const output = lines.join("\n\n");
      for (const word of output.split(/(?<=\s)/)) {
        if (signal.aborted) break;
        push(run, "message.delta", { text: word });
        if (opts.streamDelayMs) await new Promise((r) => setTimeout(r, opts.streamDelayMs));
      }
      if (signal.aborted) finish(run, "cancelled");
      else {
        run.output = output;
        finish(run, "completed", {
          output,
          usage: { input_tokens: input.length / 4, output_tokens: output.length / 4 },
        });
      }
    } catch (err) {
      if (signal.aborted) finish(run, "cancelled");
      else finish(run, "failed", { error: (err as Error).message });
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let s = "";
      req.on("data", (c: Buffer) => (s += c.toString()));
      req.on("end", () => {
        try {
          resolve(JSON.parse(s || "{}") as Record<string, unknown>);
        } catch {
          resolve({});
        }
      });
    });

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  };

  const server = createServer((req, res) => {
    void (async () => {
      if (req.headers.authorization !== `Bearer ${opts.apiKey}`) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      const url = new URL(req.url ?? "/", "http://fake");
      const parts = url.pathname.split("/").filter(Boolean); // v1 runs <id> <action>
      if (url.pathname === "/v1/capabilities") {
        send(res, 200, {
          object: "hermes.api_server.capabilities",
          platform: "hermes-agent",
          model: "fake-hermes",
          features: {
            run_submission: true,
            run_status: true,
            run_events_sse: true,
            run_stop: true,
            run_approval: true,
            session_key_header: "X-Hermes-Session-Key",
            tool_progress_events: true,
          },
        });
        return;
      }
      if (parts[0] !== "v1" || parts[1] !== "runs") {
        send(res, 404, {});
        return;
      }
      if (req.method === "POST" && parts.length === 2) {
        const body = await readBody(req);
        const key = text(req.headers["idempotency-key"] ?? "");
        const existing = key ? byKey.get(key) : undefined;
        if (existing) {
          res.setHeader("Idempotency-Replayed", "true");
          send(res, 202, { run_id: existing, status: runs.get(existing)?.status });
          return;
        }
        const run: FakeRun = {
          id: `run_fake_${++seq}`,
          status: "running",
          events: [],
          listeners: new Set(),
          output: "",
          abort: new AbortController(),
        };
        runs.set(run.id, run);
        if (key) byKey.set(key, run.id);
        void script(run, text(body.input ?? ""), text(body.instructions ?? ""));
        send(res, 200, { run_id: run.id, status: "started" });
        return;
      }
      const run = runs.get(parts[2] ?? "");
      if (!run) {
        send(res, 404, { error: "not_found" });
        return;
      }
      const action = parts[3];
      if (req.method === "GET" && !action) {
        send(res, 200, {
          object: "hermes.run",
          run_id: run.id,
          status: run.status,
          output: run.output,
          error: run.error,
        });
        return;
      }
      if (req.method === "POST" && action === "stop") {
        run.abort.abort();
        run.approval?.resolve("deny");
        if (!TERMINAL.has(run.status)) run.status = "stopping";
        setTimeout(() => {
          finish(run, "cancelled");
        }, 50);
        send(res, 200, { status: "stopping" });
        return;
      }
      if (req.method === "POST" && action === "approval") {
        const body = await readBody(req);
        const decision = text(body.decision);
        if (!["once", "deny"].includes(decision)) {
          send(res, 400, { error: "Dopl only sends once or deny" });
          return;
        }
        if (!run.approval) {
          send(res, 409, { error: "no pending approval" });
          return;
        }
        run.approval.resolve(decision);
        run.approval = undefined;
        send(res, 200, { status: decision === "deny" ? "denied" : "approved" });
        return;
      }
      if (req.method === "GET" && action === "events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        let sent = 0;
        const flush = () => {
          while (sent < run.events.length) {
            const e = run.events[sent++];
            if (!e) break;
            res.write(`event: ${e.event}\ndata: ${e.data}\n\n`);
          }
          if (TERMINAL.has(run.status) && sent >= run.events.length) cleanup();
        };
        const keepalive = setInterval(() => res.write(": keepalive\n\n"), 10_000);
        const cleanup = () => {
          clearInterval(keepalive);
          run.listeners.delete(flush);
          res.end();
        };
        run.listeners.add(flush);
        req.on("close", cleanup);
        flush();
        return;
      }
      send(res, 404, {});
    })().catch((err: unknown) => {
      if (!res.headersSent) send(res, 500, { error: (err as Error).message });
    });
  });
  return new Promise((resolve) =>
    server.listen(opts.port, "127.0.0.1", () => {
      resolve(server);
    }),
  );
}
