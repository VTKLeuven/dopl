import { api } from "@/server/api";
import { getWorkItemDetail } from "@/server/queries/work-items";

export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/items/[ref]">) {
  const { ws, ref } = await params;
  return api(ws, (ctx) => getWorkItemDetail(ctx, ref));
}
