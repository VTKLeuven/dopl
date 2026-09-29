import { api } from "@/server/api";
import { getDashboard } from "@/server/queries/dashboards";

export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/dashboards/[id]">) {
  const { ws, id } = await params;
  return api(ws, (ctx) => getDashboard(ctx, id));
}
