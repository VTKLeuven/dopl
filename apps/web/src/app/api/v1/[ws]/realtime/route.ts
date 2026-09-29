import { db } from "@/server/db";
import { realtimeHub, type RealtimeMessage } from "@/server/realtime/listener";
import { TopicAccess } from "@/server/realtime/access";
import { getActor, getWorkspaceCtx, needsTwoFactorEnrollment } from "@/server/session";

const KEEPALIVE_MS = 20_000;
const REPLAY_LIMIT = 500;

/**
 * Server-sent events for one workspace (ARCHITECTURE §4). EventSource sends
 * Last-Event-ID on reconnect; missed events are replayed, or `resync` is sent
 * when too much was missed and the client should refetch everything.
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
      const send = (msg: RealtimeMessage) =>
        write(
          `id: ${msg.id}\nevent: message\ndata: ${JSON.stringify({ topic: msg.topic, type: msg.type, payload: msg.payload })}\n\n`,
        );
      // Deliver in order even though the permission check can be async.
      let chain = Promise.resolve();
      const deliver = (msg: RealtimeMessage) => {
        chain = chain.then(async () => {
          if (TopicAccess.affectsAccess(msg)) await access.refresh();
          if (await access.allows(msg)) send(msg);
        });
      };

      write(`retry: 3000\n\n`);
      const unsubscribe = realtimeHub.subscribe(ctx.workspace.id, deliver);

      if (lastId && /^\d+$/.test(lastId)) {
        const missed = await db.realtimeEvent.findMany({
          where: { workspaceId: ctx.workspace.id, id: { gt: BigInt(lastId) } },
          orderBy: { id: "asc" },
          take: REPLAY_LIMIT + 1,
        });
        if (missed.length > REPLAY_LIMIT) {
          write(`event: resync\ndata: {}\n\n`);
        } else {
          for (const row of missed)
            deliver({
              id: row.id.toString(),
              workspaceId: row.workspaceId,
              topic: row.topic,
              type: row.type,
              payload: row.payload,
            });
        }
      }

      const ping = setInterval(() => write(`: ping\n\n`), KEEPALIVE_MS);
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
