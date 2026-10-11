import { api } from "@/server/api";
import { getHomeLayout } from "@/server/queries/home";

/** The member's Home widgets, for refetches after a save in another tab. */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/home/layout">) {
  const { ws } = await params;
  return api(ws, (ctx) => getHomeLayout(ctx));
}
