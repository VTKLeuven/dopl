import { api } from "@/server/api";
import { inboxCounts } from "@/server/queries/inbox";

/** Unread counts for the sidebar badge, the tab title and the type filter. */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/inbox/counts">) {
  const { ws } = await params;
  return api(ws, (ctx) => inboxCounts(ctx));
}
