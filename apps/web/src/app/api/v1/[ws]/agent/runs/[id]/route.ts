import { api } from "@/server/api";
import { getAgentRun } from "@/server/queries/agent";

/** One agent run with its steps and approvals (run cards, live via realtime). */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/agent/runs/[id]">) {
  const { ws, id } = await params;
  return api(ws, (ctx) => getAgentRun(ctx, id));
}
