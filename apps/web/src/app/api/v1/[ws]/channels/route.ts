import { api } from "@/server/api";
import { listSidebarChannels } from "@/server/queries/channels";

/** The Messages sidebar: project channels, joined channels and DMs with unread counts. */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/channels">) {
  const { ws } = await params;
  return api(ws, (ctx) => listSidebarChannels(ctx));
}
