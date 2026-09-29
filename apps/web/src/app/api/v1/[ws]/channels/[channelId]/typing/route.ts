import { z } from "zod";
import { api } from "@/server/api";
import { publishTyping } from "@/server/services/messages";

const Body = z.object({
  threadRootId: z.uuid().nullable().default(null),
  stop: z.boolean().default(false),
});

/**
 * Typing indicator ping. Ephemeral (NOTIFY only, nothing stored), so it's a
 * small route rather than a server action: actions run one at a time per
 * client and a ping must never delay sending the message itself.
 */
export async function POST(
  req: Request,
  { params }: RouteContext<"/api/v1/[ws]/channels/[channelId]/typing">,
) {
  const { ws, channelId } = await params;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin && origin !== process.env.APP_URL)
    return Response.json({ error: "forbidden" }, { status: 403 });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "invalid_input" }, { status: 400 });
  return api(ws, async (ctx) => {
    await publishTyping(ctx, z.uuid().parse(channelId), body.data);
    return { ok: true };
  });
}
