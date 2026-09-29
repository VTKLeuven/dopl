import { z } from "zod";
import { api } from "@/server/api";
import { publishThreadPresence } from "@/server/services/mail";

const Body = z.object({ state: z.enum(["VIEWING", "REPLYING"]) });

/**
 * "Sam is viewing / replying" heartbeat. Ephemeral like chat's typing ping,
 * so a small route rather than a server action (actions run one at a time).
 */
export async function POST(
  req: Request,
  { params }: RouteContext<"/api/v1/[ws]/mail/threads/[id]/presence">,
) {
  const { ws, id } = await params;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin && origin !== process.env.APP_URL)
    return Response.json({ error: "forbidden" }, { status: 403 });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "invalid_input" }, { status: 400 });
  return api(ws, async (ctx) => {
    await publishThreadPresence(ctx, { threadId: id, state: body.data.state });
    return { ok: true };
  });
}
