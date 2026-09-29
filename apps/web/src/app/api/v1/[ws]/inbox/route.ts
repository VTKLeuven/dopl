import { InboxQuerySchema } from "@dopl/shared/schemas/inbox";
import { api } from "@/server/api";
import { listNotifications } from "@/server/queries/inbox";

/** One page of the Inbox: ?view=unread|all|snoozed|archived&filter=<bucket>&cursor=… */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/inbox">) {
  const { ws } = await params;
  const url = new URL(req.url);
  const q = InboxQuerySchema.parse({
    view: url.searchParams.get("view") ?? "all",
    filter: url.searchParams.get("filter"),
    cursor: url.searchParams.get("cursor"),
  });
  return api(ws, (ctx) => listNotifications(ctx, q));
}
