import { api } from "@/server/api";
import { listBrowsableChannels } from "@/server/queries/channels";

/** Public channels anyone may join ("Browse channels"). */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/channels/browse">) {
  const { ws } = await params;
  return api(ws, (ctx) => listBrowsableChannels(ctx));
}
