import { api } from "@/server/api";
import { listAgentActivity, listRunsForChannel } from "@/server/queries/agent";

/** The agent page (pending approvals, recent runs), or ?channelId= for one conversation's runs. */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/agent">) {
  const { ws } = await params;
  const channelId = new URL(req.url).searchParams.get("channelId");
  if (channelId) return api(ws, (ctx) => listRunsForChannel(ctx, channelId));
  return api(ws, (ctx) => listAgentActivity(ctx));
}
