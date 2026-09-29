import "server-only";
import { realtimeHub, type RealtimeMessage } from "../realtime/listener";

/**
 * Blocks an MCP tool call until `check()` returns a value (D-032): a step
 * finished, an approval decided. Wakes on matching realtime events from the
 * LISTEN hub and re-checks the database every few seconds in case a NOTIFY
 * was missed. Returns null on timeout or abort; `onTick` sends MCP progress
 * notifications so Hermes keeps the call open.
 */
export async function waitFor<T>(opts: {
  workspaceId: string;
  /** Which events are worth a re-check. */
  wake: (msg: RealtimeMessage) => boolean;
  check: () => Promise<T | null>;
  timeoutMs: number;
  signal?: AbortSignal;
  onTick?: (elapsedMs: number) => Promise<void> | void;
  tickMs?: number;
  pollMs?: number;
}): Promise<T | null> {
  const started = Date.now();
  let wakeUp: () => void = () => undefined;
  let pending = false;
  const unsubscribe = realtimeHub.subscribe(opts.workspaceId, (msg) => {
    if (opts.wake(msg)) {
      pending = true;
      wakeUp();
    }
  });
  let lastTick = started;
  try {
    for (;;) {
      pending = false;
      const value = await opts.check();
      if (value !== null) return value;
      const elapsed = Date.now() - started;
      if (elapsed >= opts.timeoutMs || opts.signal?.aborted) return null;
      if (opts.onTick && Date.now() - lastTick >= (opts.tickMs ?? 15_000)) {
        lastTick = Date.now();
        await opts.onTick(elapsed);
      }
      if (pending) continue;
      const delay = Math.min(opts.pollMs ?? 3_000, opts.timeoutMs - elapsed);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        const done = () => {
          clearTimeout(timer);
          opts.signal?.removeEventListener("abort", done);
          resolve();
        };
        wakeUp = done;
        opts.signal?.addEventListener("abort", done, { once: true });
      });
      wakeUp = () => undefined;
    }
  } finally {
    unsubscribe();
  }
}
