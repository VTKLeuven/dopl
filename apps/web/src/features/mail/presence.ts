"use client";

import { useEffect, useState } from "react";
import { realtimeClient } from "@/features/realtime/client";

const PING_MS = 10_000;
const TTL_MS = 25_000;

export interface Presence {
  userId: string;
  name: string;
  state: "VIEWING" | "REPLYING";
}

/**
 * Collision indicator (ARCHITECTURE §9): heartbeats say "I'm viewing" or
 * "I'm replying" on the thread's topic, and others' heartbeats show up here.
 * Ephemeral like chat's typing: never stored, gone TTL_MS after the last ping.
 */
export function useThreadPresence(
  ws: string,
  threadId: string,
  me: string,
  replying: boolean,
): Presence[] {
  const [others, setOthers] = useState<Map<string, Presence & { until: number }>>(new Map());

  useEffect(() => {
    const send = () =>
      void fetch(`/api/v1/${ws}/mail/threads/${threadId}/presence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: replying ? "REPLYING" : "VIEWING" }),
      }).catch(() => {});
    send();
    const timer = setInterval(send, PING_MS);
    return () => clearInterval(timer);
  }, [ws, threadId, replying]);

  useEffect(() => {
    const topic = `emailThread:${threadId}`;
    const unsubscribe = realtimeClient(ws).subscribe({
      onEvent: (ev) => {
        if (ev.topic !== topic || ev.type !== "presence" || !ev.payload) return;
        const p = ev.payload as { userId?: string; name?: string; state?: Presence["state"] };
        if (!p.userId || p.userId === me) return;
        const entry = {
          userId: p.userId,
          name: p.name ?? "",
          state: p.state === "REPLYING" ? ("REPLYING" as const) : ("VIEWING" as const),
          until: Date.now() + TTL_MS,
        };
        setOthers((prev) => new Map(prev).set(entry.userId, entry));
      },
    });
    const sweep = setInterval(() => {
      setOthers((prev) => {
        const now = Date.now();
        if (![...prev.values()].some((x) => x.until <= now)) return prev;
        return new Map([...prev].filter(([, x]) => x.until > now));
      });
    }, 1_000);
    return () => {
      unsubscribe();
      clearInterval(sweep);
      setOthers(new Map());
    };
  }, [ws, threadId, me]);

  return [...others.values()].map(({ userId, name, state }) => ({ userId, name, state }));
}
