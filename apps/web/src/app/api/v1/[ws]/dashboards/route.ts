import { api } from "@/server/api";
import { listDashboards } from "@/server/queries/dashboards";

/** Dashboards for the analytics sidebar. */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/dashboards">) {
  const { ws } = await params;
  return api(ws, listDashboards);
}
