import { z } from "zod";
import { api } from "@/server/api";
import { getChannelDetail } from "@/server/queries/channels";

/** Channel header, members and what the reader may do. */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/v1/[ws]/channels/[channelId]">,
) {
  const { ws, channelId } = await params;
  return api(ws, (ctx) => getChannelDetail(ctx, z.uuid().parse(channelId)));
}
