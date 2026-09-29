import { db } from "@/server/db";
import { realtimeHub, type RealtimeMessage } from "@/server/realtime/listener";
import { TopicAccess } from "@/server/realtime/access";
import { getActor, getWorkspaceCtx, needsTwoFactorEnrollment } from "@/server/session";

const KEEPALIVE_MS = 20_000;
const REPLAY_LIMIT = 500;

/**
 * Server-sent events for one workspace (ARCHITECTURE §4). EventSource sends
 * Last-Event-ID on reconnect (a new leader tab passes `?since=`); missed
 * events are replayed, or `resync` is sent when too much was missed and the
 * client should refetch everything. Ephemeral events (typing) have no id.
 * Behind Caddy the route needs `flush_interval -1` so events aren't buffered.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/realtime">) {
  const { ws } = await params;
  const actor = await getActor();
  if (!actor) return new Response("unauthorized", { status: 401 });
  const ctx = await getWorkspaceCtx(ws);
  if (!ctx) return new Response("not found", { status: 404 });
  if (await needsTwoFactorEnrollment(ctx)) return new Response("forbidden", { status: 403 });

  const access = new TopicAccess(ctx);
  await access.refresh();
  const lastId = req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("since");
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      // Stored events carry their id (Last-Event-ID); ephemeral ones don't.
      const send = (msg: RealtimeMessage) =>
        write(
          `${msg.id ? `id: ${msg.id}\n` : ""}event: message\ndata: ${JSON.stringify({ topic: msg.topic, type: msg.type, payload: msg.payload })}\n\n`,
        );
      // Deliver in order even though the permission check can be async.
      let chain = Promise.resolve();
      const enqueue = (msg: RealtimeMessage) => {
        chain = chain.then(async () => {
          if (TopicAccess.affectsAccess(msg)) await access.refresh();
          if (await access.allows(msg)) send(msg);
        });
      };
      // Live events that arrive while missed ones are still being read are
      // held back, then delivered after the replay, without duplicates.
      const replayFrom = lastId && /^\d+$/.test(lastId) ? BigInt(lastId) : null;
      let replaying = replayFrom !== null;
      const held: RealtimeMessage[] = [];
      const deliver = (msg: RealtimeMessage) => {
        if (replaying) held.push(msg);
        else enqueue(msg);
      };

      write(`retry: 3000\n\n`);
      const unsubscribe = realtimeHub.subscribe(ctx.workspace.id, deliver);

      if (replayFrom !== null) {
        const missed = await db.realtimeEvent.findMany({
          where: { workspaceId: ctx.workspace.id, id: { gt: replayFrom } },
          orderBy: { id: "asc" },
          take: REPLAY_LIMIT + 1,
        });
        let upTo = replayFrom;
        if (missed.length > REPLAY_LIMIT) {
          write(`event: resync\ndata: {}\n\n`);
          upTo = missed.at(-1)?.id ?? replayFrom;
        } else {
          for (const row of missed) {
            enqueue({
              id: row.id.toString(),
              workspaceId: row.workspaceId,
              topic: row.topic,
              type: row.type,
              payload: row.payload,
            });
            upTo = row.id;
          }
        }
        replaying = false;
        for (const msg of held.splice(0)) if (!msg.id || BigInt(msg.id) > upTo) enqueue(msg);
      }

      // A named event rather than a comment, so the client can tell a quiet
      // stream from a dead one (its watchdog reconnects after missed pings).
      const ping = setInterval(() => write(`event: ping\ndata: {}\n\n`), KEEPALIVE_MS);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
