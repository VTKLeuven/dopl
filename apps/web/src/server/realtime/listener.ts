import "server-only";
import { Client } from "pg";
import { z } from "zod";
import { db } from "../db";

export const EPHEMERAL_CHANNEL = "dopl_ephemeral";
const EphemeralSchema = z.object({
  workspaceId: z.uuid(),
  topic: z.string().max(200),
  type: z.string().max(100),
  payload: z.unknown(),
});

/**
 * One LISTEN connection per web process (ARCHITECTURE §4). A NOTIFY on
 * `dopl_realtime` carries only the realtime_events id; the row is read once
 * here and handed to every subscriber of its workspace. `dopl_ephemeral`
 * carries small JSON events that are never stored (typing indicators): they
 * have no id, so they are never replayed. Reconnects with backoff and never
 * throws into request handlers.
 */
export interface RealtimeMessage {
  /** realtime_events id; null for ephemeral events. */
  id: string | null;
  workspaceId: string;
  topic: string;
  type: string;
  payload: unknown;
}

type Listener = (msg: RealtimeMessage) => void;

class RealtimeHub {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private subscribers = new Map<string, Set<Listener>>();
  private backoff = 500;

  subscribe(workspaceId: string, fn: Listener): () => void {
    let set = this.subscribers.get(workspaceId);
    if (!set) this.subscribers.set(workspaceId, (set = new Set()));
    set.add(fn);
    void this.ensureConnected();
    return () => {
      set.delete(fn);
      if (set.size === 0) this.subscribers.delete(workspaceId);
    };
  }

  private ensureConnected(): Promise<void> {
    if (this.client) return Promise.resolve();
    this.connecting ??= this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect() {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      application_name: "dopl-web-realtime",
      connectionTimeoutMillis: 5_000,
      keepAlive: true,
    });
    const retry = () => {
      this.client = null;
      client.removeAllListeners();
      void client.end().catch(() => undefined);
      const wait = this.backoff;
      this.backoff = Math.min(this.backoff * 2, 30_000);
      if (this.subscribers.size > 0) setTimeout(() => void this.ensureConnected(), wait);
    };
    try {
      await client.connect();
      client.on("notification", (n) => {
        if (n.channel === EPHEMERAL_CHANNEL) this.dispatchEphemeral(n.payload);
        else void this.dispatch(n.payload);
      });
      client.on("error", (err) => {
        console.error("[realtime] listener error", err.message);
        retry();
      });
      client.on("end", retry);
      await client.query("LISTEN dopl_realtime");
      await client.query(`LISTEN ${EPHEMERAL_CHANNEL}`);
      this.client = client;
      this.backoff = 500;
    } catch (err) {
      console.error("[realtime] could not connect", (err as Error).message);
      retry();
    }
  }

  private dispatchEphemeral(payload: string | undefined) {
    if (!payload) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    const msg = EphemeralSchema.safeParse(parsed);
    if (!msg.success) return;
    this.fanOut({ id: null, ...msg.data });
  }

  private async dispatch(payload: string | undefined) {
    if (!payload || !/^\d+$/.test(payload)) return;
    const row = await db.realtimeEvent
      .findUnique({ where: { id: BigInt(payload) } })
      .catch(() => null);
    if (!row) return;
    this.fanOut({
      id: row.id.toString(),
      workspaceId: row.workspaceId,
      topic: row.topic,
      type: row.type,
      payload: row.payload,
    });
  }

  private fanOut(msg: RealtimeMessage) {
    const set = this.subscribers.get(msg.workspaceId);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(msg);
      } catch (err) {
        console.error("[realtime] subscriber failed", err);
      }
    }
  }
}

// One hub per process; survives HMR in dev.
const g = globalThis as unknown as { __doplRealtime?: RealtimeHub };
export const realtimeHub = (g.__doplRealtime ??= new RealtimeHub());
