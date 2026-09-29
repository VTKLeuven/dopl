import "server-only";
import { Client } from "pg";
import { db } from "../db";

/**
 * One LISTEN connection per web process (ARCHITECTURE §4). A NOTIFY carries
 * only the realtime_events id; the row is read once here and handed to every
 * subscriber of its workspace. Reconnects with backoff and never throws into
 * request handlers.
 */
export interface RealtimeMessage {
  id: string;
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
      client.on("notification", (n) => void this.dispatch(n.payload));
      client.on("error", (err) => {
        console.error("[realtime] listener error", err.message);
        retry();
      });
      client.on("end", retry);
      await client.query("LISTEN dopl_realtime");
      this.client = client;
      this.backoff = 500;
    } catch (err) {
      console.error("[realtime] could not connect", (err as Error).message);
      retry();
    }
  }

  private async dispatch(payload: string | undefined) {
    if (!payload || !/^\d+$/.test(payload)) return;
    const row = await db.realtimeEvent
      .findUnique({ where: { id: BigInt(payload) } })
      .catch(() => null);
    if (!row) return;
    const set = this.subscribers.get(row.workspaceId);
    if (!set) return;
    const msg: RealtimeMessage = {
      id: row.id.toString(),
      workspaceId: row.workspaceId,
      topic: row.topic,
      type: row.type,
      payload: row.payload,
    };
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
