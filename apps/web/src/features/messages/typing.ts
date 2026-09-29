"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TYPING_PING_MS, TYPING_TTL_MS } from "@dopl/shared/schemas/messages";
import { realtimeClient } from "@/features/realtime/client";

interface Typist {
  name: string;
  until: number;
}

/**
 * Who else is typing here (ephemeral realtime events, never stored). An
 * indicator lasts TYPING_TTL_MS after the last ping, so it disappears
 * within ~4 s of someone stopping, or at once when they send.
 */
export function useTypingUsers(
  ws: string,
  channelId: string,
  threadRootId: string | null,
  me: string,
): string[] {
  const [typists, setTypists] = useState<Map<string, Typist>>(new Map());
  useEffect(() => {
    const topic = `channel:${channelId}`;
    const unsubscribe = realtimeClient(ws).subscribe({
      onEvent: (ev) => {
        if (ev.topic !== topic || !ev.payload) return;
        // A message from someone ends their typing indicator.
        if (ev.type === "message.created") {
          const author = ev.payload.authorId;
          if (typeof author === "string")
            setTypists((prev) => {
              if (!prev.has(author)) return prev;
              const next = new Map(prev);
              next.delete(author);
              return next;
            });
          return;
        }
        if (ev.type !== "typing") return;
        const p = ev.payload as {
          userId?: string;
          name?: string;
          threadRootId?: string | null;
          stop?: boolean;
        };
        if (!p.userId || p.userId === me || (p.threadRootId ?? null) !== threadRootId) return;
        const userId = p.userId;
        setTypists((prev) => {
          const next = new Map(prev);
          if (p.stop) next.delete(userId);
          else next.set(userId, { name: p.name ?? "", until: Date.now() + TYPING_TTL_MS });
          return next;
        });
      },
    });
    const timer = setInterval(() => {
      setTypists((prev) => {
        const now = Date.now();
        if (![...prev.values()].some((x) => x.until <= now)) return prev;
        return new Map([...prev].filter(([, x]) => x.until > now));
      });
    }, 500);
    return () => {
      unsubscribe();
      clearInterval(timer);
      setTypists(new Map());
    };
  }, [ws, channelId, threadRootId, me]);
  return [...typists.values()].map((x) => x.name);
}

/** Sends typing pings while the composer has text (throttled), and a stop on send/clear. */
export function useTypingPing(ws: string, channelId: string, threadRootId: string | null) {
  const last = useRef(0);
  const post = useCallback(
    (stop: boolean) => {
      void fetch(`/api/v1/${ws}/channels/${channelId}/typing`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadRootId, stop }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [ws, channelId, threadRootId],
  );
  const typing = useCallback(() => {
    const now = Date.now();
    if (now - last.current < TYPING_PING_MS) return;
    last.current = now;
    post(false);
  }, [post]);
  const stop = useCallback(() => {
    if (last.current === 0) return;
    last.current = 0;
    post(true);
  }, [post]);
  return { typing, stop };
}
