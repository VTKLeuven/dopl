"use client";

/**
 * One realtime stream per browser (D-023, ARCHITECTURE §4).
 *
 * Tabs of the same workspace elect a leader with the Web Locks API: the tab
 * holding the lock opens the EventSource and relays every event to the
 * others over a BroadcastChannel. When the leader closes, its lock is
 * released and the next tab takes over, resuming from the last event id any
 * tab has seen (`?since=`), so nothing is lost in the hand-over. Browsers
 * without locks or BroadcastChannel fall back to one stream per tab.
 *
 * The stream itself reconnects on its own (EventSource + Last-Event-ID); on
 * top of that a watchdog reopens it when pings stop (a half-open connection
 * after the network drops) and when the browser comes back online.
 */

export interface WireEvent {
  topic: string;
  type: string;
  payload: ({ id?: string } & Record<string, unknown>) | null;
}

export interface RealtimeListener {
  onEvent?: (ev: WireEvent, id: string | null) => void;
  onResync?: () => void;
}

type Relay =
  { t: "event"; id: string | null; ev: WireEvent } | { t: "resync" } | { t: "cursor"; id: string };

const STALE_MS = 50_000; // two missed 20 s pings
const WATCHDOG_MS = 10_000;
const STOP_DELAY_MS = 1_000;

class RealtimeClient {
  private listeners = new Set<RealtimeListener>();
  private es: EventSource | null = null;
  private bc: BroadcastChannel | null = null;
  private lastId: string | null = null;
  private lastActivity = Date.now();
  private leader = false;
  private running = false;
  private abort: AbortController | null = null;
  private releaseLock: (() => void) | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1_000;

  constructor(private readonly ws: string) {}

  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (!this.running) this.start();
    return () => {
      this.listeners.delete(listener);
      // Remounts (navigation, strict mode) shouldn't drop the stream.
      if (this.listeners.size === 0)
        this.stopTimer ??= setTimeout(() => {
          this.stopTimer = null;
          if (this.listeners.size === 0) this.stop();
        }, STOP_DELAY_MS);
    };
  }

  /** True when this tab holds the stream (for tests and diagnostics). */
  get isLeader() {
    return this.leader;
  }

  private emit(ev: WireEvent, id: string | null) {
    for (const l of this.listeners) {
      try {
        l.onEvent?.(ev, id);
      } catch (err) {
        console.error("[realtime] listener failed", err);
      }
    }
  }

  private emitResync() {
    for (const l of this.listeners) l.onResync?.();
  }

  private start() {
    this.running = true;
    const canShare =
      typeof BroadcastChannel !== "undefined" &&
      typeof navigator !== "undefined" &&
      "locks" in navigator;
    if (!canShare) {
      this.becomeLeader();
      return;
    }
    const name = `dopl-realtime:${this.ws}`;
    this.bc = new BroadcastChannel(name);
    this.bc.onmessage = (e: MessageEvent<Relay>) => {
      const msg = e.data;
      if (msg.t === "event") {
        if (msg.id) this.lastId = msg.id;
        this.emit(msg.ev, msg.id);
      } else if (msg.t === "resync") this.emitResync();
      else if (msg.t === "cursor" && !this.lastId) this.lastId = msg.id;
    };
    this.abort = new AbortController();
    navigator.locks
      .request(name, { signal: this.abort.signal }, () => {
        if (!this.running) return undefined;
        this.becomeLeader();
        // Hold the lock until this tab stops or closes.
        return new Promise<void>((resolve) => {
          this.releaseLock = resolve;
        });
      })
      .catch(() => undefined); // aborted
  }

  private becomeLeader() {
    this.leader = true;
    this.connect();
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastActivity > STALE_MS) this.reconnect(0);
    }, WATCHDOG_MS);
    window.addEventListener("online", this.onOnline);
  }

  private onOnline = () => {
    if (Date.now() - this.lastActivity > 5_000) this.reconnect(0);
  };

  private connect() {
    const url = `/api/v1/${this.ws}/realtime${this.lastId ? `?since=${this.lastId}` : ""}`;
    const es = new EventSource(url);
    this.es = es;
    this.lastActivity = Date.now();
    const touch = () => {
      this.lastActivity = Date.now();
      this.backoff = 1_000;
    };
    es.onopen = touch;
    es.addEventListener("ping", touch);
    es.onmessage = (e: MessageEvent<string>) => {
      touch();
      let ev: WireEvent;
      try {
        ev = JSON.parse(e.data) as WireEvent;
      } catch {
        return;
      }
      const id = e.lastEventId || null;
      if (id) this.lastId = id;
      this.emit(ev, id);
      this.relay({ t: "event", id, ev });
    };
    es.addEventListener("resync", () => {
      touch();
      this.emitResync();
      this.relay({ t: "resync" });
    });
    es.onerror = () => {
      // CONNECTING: the browser retries by itself with Last-Event-ID.
      // CLOSED: it gave up (e.g. offline); reopen ourselves with backoff.
      if (es.readyState === EventSource.CLOSED) this.reconnect(this.backoff);
    };
  }

  private relay(msg: Relay) {
    try {
      this.bc?.postMessage(msg);
    } catch {
      // channel closed
    }
  }

  private reconnect(delay: number) {
    if (!this.leader || !this.running) return;
    this.es?.close();
    this.es = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.leader && this.running) this.connect();
    }, delay);
    this.backoff = Math.min(this.backoff * 2, 30_000);
  }

  private stop() {
    this.running = false;
    this.es?.close();
    this.es = null;
    if (this.lastId) this.relay({ t: "cursor", id: this.lastId });
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.watchdog = null;
    this.reconnectTimer = null;
    if (this.leader) window.removeEventListener("online", this.onOnline);
    this.leader = false;
    this.abort?.abort();
    this.abort = null;
    this.releaseLock?.();
    this.releaseLock = null;
    this.bc?.close();
    this.bc = null;
  }
}

const clients = new Map<string, RealtimeClient>();

/** The workspace's shared realtime connection (created on first use). */
export function realtimeClient(ws: string): RealtimeClient {
  let c = clients.get(ws);
  if (!c) clients.set(ws, (c = new RealtimeClient(ws)));
  return c;
}

/**
 * EventSource-shaped view of the shared stream, so existing consumers keep
 * their `onmessage` / `addEventListener("resync")` / `close()` code.
 */
export class SharedEventSource {
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  private resync = new Set<() => void>();
  private unsubscribe: () => void;

  constructor(ws: string) {
    this.unsubscribe = realtimeClient(ws).subscribe({
      onEvent: (ev, id) =>
        this.onmessage?.(
          new MessageEvent("message", { data: JSON.stringify(ev), lastEventId: id ?? "" }),
        ),
      onResync: () => {
        for (const fn of this.resync) fn();
      },
    });
  }

  addEventListener(type: "resync", fn: () => void) {
    if (type === "resync") this.resync.add(fn);
  }

  close() {
    this.unsubscribe();
    this.resync.clear();
  }
}
