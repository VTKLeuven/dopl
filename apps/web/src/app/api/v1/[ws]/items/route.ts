import { api } from "@/server/api";
import { parseItemsQuery } from "@/server/queries/work-items";
import { listWorkspaceItems } from "@/server/queries/workspace-items";

/** Items across every project the actor can see (workspace views). */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/items">) {
  const { ws } = await params;
  const query = parseItemsQuery(new URL(req.url).searchParams);
  return api(ws, (ctx) => listWorkspaceItems(ctx, query));
}
