import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeHermes } from "./fake-hermes";
import { HermesRuntime, mapEvent, parseSse } from "./hermes";
import type { RuntimeEvent } from "./runtime";

const PORT = 8699;
const KEY = "test-hermes-key";
let server: Server;
beforeAll(async () => {
  server = await startFakeHermes({
    port: PORT,
    apiKey: KEY,
    mcpUrl: "http://127.0.0.1:1/api/mcp",
    mcpToken: "unused",
  });
});
afterAll(() => {
  server.close();
});

const hermes = () => new HermesRuntime(`http://127.0.0.1:${PORT}/`, KEY);
const input = (runId: string, request: string) => ({
  runId,
  sessionId: "dopl:workItem:1",
  sessionKey: "dopl:agent:workItem",
  instructions: "run_token: dopl_run_test",
  input: `Bram asked you:\n${request}`,
});

async function collect(rt: HermesRuntime, id: string, until?: (e: RuntimeEvent) => Promise<void>) {
  const events: RuntimeEvent[] = [];
  for await (const e of rt.events(id, AbortSignal.timeout(10_000))) {
    events.push(e);
    await until?.(e);
    if (e.type.startsWith("run.")) break;
  }
  return events;
}

describe("HermesRuntime (against the fake Hermes)", () => {
  it("checks capabilities and refuses a wrong key", async () => {
    expect(await hermes().capabilities()).toMatchObject({ ok: true, missing: [] });
    await expect(
      new HermesRuntime(`http://127.0.0.1:${PORT}`, "nope").capabilities(),
    ).rejects.toThrow(/refused the API key/);
  });

  it("streams a run to completion; the Idempotency-Key never starts a second run", async () => {
    const rt = hermes();
    const a = await rt.startRun(input("run-1", "hello"));
    const b = await rt.startRun(input("run-1", "hello"));
    expect(b.runtimeRunId).toBe(a.runtimeRunId);
    const events = await collect(rt, a.runtimeRunId);
    const text = events
      .filter((e) => e.type === "message.delta")
      .map((e) => (e as { text: string }).text)
      .join("");
    expect(text).toContain("stand-in for Hermes");
    expect(events.at(-1)).toMatchObject({ type: "run.completed" });
    expect(await rt.status(a.runtimeRunId)).toMatchObject({ status: "completed" });
  });

  it("bridges a Hermes approval with once or deny", async () => {
    const rt = hermes();
    const { runtimeRunId } = await rt.startRun(
      input("run-2", "ask hermes approval `rm -rf /tmp/x`"),
    );
    const events = await collect(rt, runtimeRunId, async (e) => {
      if (e.type === "approval.requested")
        await rt.resolveApproval(runtimeRunId, e.requestId, "deny");
    });
    expect(events.find((e) => e.type === "approval.requested")).toMatchObject({
      tool: "terminal",
      description: "rm -rf /tmp/x",
    });
    expect(events.at(-1)).toMatchObject({ type: "run.completed" });
    expect((events.at(-1) as { output: string }).output).toContain("denied");
  });

  it("stops a run", async () => {
    const rt = hermes();
    const { runtimeRunId } = await rt.startRun(input("run-3", "ask hermes approval `sleep`"));
    await rt.stop(runtimeRunId);
    const events = await collect(rt, runtimeRunId);
    expect(events.at(-1)).toMatchObject({ type: "run.cancelled" });
  });
});

describe("SSE parsing", () => {
  it("handles comments, CRLF, multi-line data and split chunks", async () => {
    const chunks = [
      ": keepalive\r\n\r\nevent: message.delta\r\nda",
      'ta: {"text":"a"}\r\n\r\n',
      'data: {"event":"run.failed","error":"x"}\n\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
        c.close();
      },
    });
    const frames = [];
    for await (const f of parseSse(body)) frames.push(f);
    expect(frames).toEqual([
      { event: "message.delta", data: '{"text":"a"}' },
      { event: "message", data: '{"event":"run.failed","error":"x"}' },
    ]);
    expect(mapEvent(frames[1]!.event, frames[1]!.data)).toEqual({ type: "run.failed", error: "x" });
    expect(
      mapEvent("approval.request", '{"approval_id":"apr_1","tool":"terminal","context":"ls"}'),
    ).toEqual({
      type: "approval.requested",
      requestId: "apr_1",
      tool: "terminal",
      description: "ls",
    });
    expect(mapEvent("something.new", "{}")).toBeNull();
  });
});
