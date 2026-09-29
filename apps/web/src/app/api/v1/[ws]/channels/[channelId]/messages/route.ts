import { z } from "zod";
import { api } from "@/server/api";
import { listChannelMessages } from "@/server/queries/channels";

/** Top-level messages, newest page first: ?before=<cursor> loads older ones. */
export async function GET(
  req: Request,
  { params }: RouteContext<"/api/v1/[ws]/channels/[channelId]/messages">,
) {
  const { ws, channelId } = await params;
  const before = new URL(req.url).searchParams.get("before");
  return api(ws, (ctx) =>
    listChannelMessages(ctx, z.uuid().parse(channelId), { before: before?.slice(0, 80) ?? null }),
  );
}
