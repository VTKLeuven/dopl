import {
  RuntimeBusyError,
  RuntimeError,
  type AgentRuntime,
  type RuntimeCapabilities,
  type RuntimeEvent,
  type RuntimeRunStatus,
  type StartRunInput,
} from "./runtime";

/** Features Dopl can't work without (D-030). `run_approval` bridges Hermes' own gates. */
const REQUIRED = ["run_submission", "run_status", "run_events_sse", "run_stop"] as const;

type Json = Record<string, unknown>;
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/**
 * Hermes Agent's API server, Runs API (D-030): `POST /v1/runs` with
 * `Idempotency-Key = AgentRun.id`, `GET /v1/runs/{id}/events` (SSE),
 * `/approval` (once|deny only), `/stop`, `GET /v1/runs/{id}` for
 * reconciliation after a restart.
 */
export class HermesRuntime implements AgentRuntime {
  readonly kind = "HERMES" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(path: string) {
    return `${this.baseUrl.replace(/\/+$/, "")}${path}`;
  }

  private async request(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (init.body) headers.set("Content-Type", "application/json");
    const signal = init.signal ?? AbortSignal.timeout(init.timeoutMs ?? 30_000);
    try {
      return await this.fetchImpl(this.url(path), { ...init, headers, signal });
    } catch (err) {
      throw new RuntimeError(`Hermes unreachable: ${(err as Error).message}`);
    }
  }

  private async json(res: Response): Promise<Json> {
    const body = (await res.json().catch(() => ({}))) as unknown;
    return body && typeof body === "object" ? (body as Json) : {};
  }

  async capabilities(): Promise<RuntimeCapabilities> {
    const res = await this.request("/v1/capabilities", { timeoutMs: 10_000 });
    if (res.status === 401 || res.status === 403)
      throw new RuntimeError("Hermes refused the API key", res.status);
    if (!res.ok) throw new RuntimeError(`Hermes answered ${res.status}`, res.status);
    const body = await this.json(res);
    const features = (body.features ?? {}) as Json;
    const missing = REQUIRED.filter((f) => features[f] !== true);
    return { ok: missing.length === 0, model: str(body.model) || null, features, missing };
  }

  async startRun(input: StartRunInput): Promise<{ runtimeRunId: string }> {
    const res = await this.request("/v1/runs", {
      method: "POST",
      headers: {
        "Idempotency-Key": input.runId,
        "X-Hermes-Session-Id": input.sessionId,
        "X-Hermes-Session-Key": input.sessionKey,
      },
      body: JSON.stringify({
        input: input.input,
        instructions: input.instructions,
        // The body field, not only the header: /v1/runs has ignored the header.
        session_id: input.sessionId,
        ...(input.model ? { model: input.model } : {}),
      }),
    });
    if (res.status === 429) throw new RuntimeBusyError("Hermes is at its concurrent-run limit");
    if (!res.ok) {
      const body = await this.json(res);
      throw new RuntimeError(
        `Hermes refused the run (${res.status}${body.code ? `: ${str(body.code)}` : ""})`,
        res.status,
      );
    }
    const body = await this.json(res);
    const id = str(body.run_id);
    if (!id) throw new RuntimeError("Hermes returned no run_id");
    return { runtimeRunId: id };
  }

  async *events(runtimeRunId: string, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
    const res = await this.request(`/v1/runs/${encodeURIComponent(runtimeRunId)}/events`, {
      headers: { Accept: "text/event-stream" },
      signal,
    });
    if (!res.ok || !res.body) throw new RuntimeError(`Hermes events: ${res.status}`, res.status);
    for await (const raw of parseSse(res.body, signal)) {
      const event = mapEvent(raw.event, raw.data);
      if (event) yield event;
    }
  }

  async resolveApproval(runtimeRunId: string, _requestId: string, choice: "once" | "deny") {
    // Never "session" or "always": every action is approved on its own (D-030).
    const res = await this.request(`/v1/runs/${encodeURIComponent(runtimeRunId)}/approval`, {
      method: "POST",
      body: JSON.stringify({ decision: choice }),
    });
    if (!res.ok && res.status !== 404 && res.status !== 409)
      throw new RuntimeError(`Hermes approval: ${res.status}`, res.status);
  }

  async stop(runtimeRunId: string) {
    const res = await this.request(`/v1/runs/${encodeURIComponent(runtimeRunId)}/stop`, {
      method: "POST",
      timeoutMs: 10_000,
    });
    if (!res.ok && res.status !== 404 && res.status !== 409)
      throw new RuntimeError(`Hermes stop: ${res.status}`, res.status);
  }

  async status(runtimeRunId: string): Promise<RuntimeRunStatus> {
    const res = await this.request(`/v1/runs/${encodeURIComponent(runtimeRunId)}`, {
      timeoutMs: 10_000,
    });
    if (res.status === 404) return { status: "unknown" };
    if (!res.ok) throw new RuntimeError(`Hermes status: ${res.status}`, res.status);
    const body = await this.json(res);
    const status = str(body.status);
    switch (status) {
      case "completed":
        return { status, output: str(body.output), usage: body.usage };
      case "failed":
      case "cancelled":
      case "interrupted":
        return { status, error: str(body.error) || undefined };
      case "running":
      case "started":
      case "stopping":
      case "waiting_for_approval":
        return { status };
      default:
        return { status: "unknown" };
    }
  }
}

/** One SSE frame: `event:` name and joined `data:` lines. Comment lines (`: keepalive`) are skipped. */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.search(/\r?\n/)) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + (buffer[nl] === "\r" ? 2 : 1));
        if (line === "") {
          if (data.length) yield { event, data: data.join("\n") };
          event = "message";
          data = [];
        } else if (line.startsWith(":")) {
          continue;
        } else {
          const i = line.indexOf(":");
          const field = i < 0 ? line : line.slice(0, i);
          const value = i < 0 ? "" : line.slice(i + 1).replace(/^ /, "");
          if (field === "event") event = value;
          else if (field === "data") data.push(value);
        }
      }
    }
    if (data.length) yield { event, data: data.join("\n") };
  } finally {
    reader.releaseLock();
    await body.cancel().catch(() => undefined);
  }
}

/** Hermes event → RuntimeEvent. Unknown events are ignored. */
export function mapEvent(name: string, data: string): RuntimeEvent | null {
  let d: Json = {};
  try {
    const parsed = JSON.parse(data) as unknown;
    if (parsed && typeof parsed === "object") d = parsed as Json;
  } catch {
    return null;
  }
  const type = name === "message" ? str(d.event ?? d.type) : name;
  switch (type) {
    case "message.delta":
      return { type, text: str(d.text ?? d.delta) };
    case "message.interim":
      return d.already_streamed ? null : { type, text: str(d.text) };
    case "tool.started":
      return { type, tool: str(d.tool, "tool"), preview: str(d.preview) };
    case "tool.completed":
      return {
        type,
        tool: str(d.tool, "tool"),
        error: Boolean(d.error),
        preview: str(d.preview),
        durationSec: typeof d.duration === "number" ? d.duration : 0,
      };
    case "approval.request":
    case "approval.requested":
      return {
        type: "approval.requested",
        requestId: str(d.approval_id ?? d.id ?? d.request_id),
        tool: str(d.tool, "tool"),
        description: str(d.command ?? d.context ?? d.description),
      };
    case "approval.cancelled":
    case "approval.resolved":
      return {
        type: "approval.cancelled",
        requestId: str(d.approval_id ?? d.id),
        reason: str(d.reason ?? d.status),
      };
    case "run.completed":
      return { type, output: str(d.output), usage: d.usage };
    case "run.failed":
    case "run.cancelled":
    case "run.interrupted":
      return { type, error: str(d.error) || undefined };
    default:
      return null;
  }
}
