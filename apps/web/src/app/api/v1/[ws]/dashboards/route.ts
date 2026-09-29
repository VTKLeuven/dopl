import { z } from "zod";
import { api } from "@/server/api";
import { listDashboards } from "@/server/queries/dashboards";

/** Dashboards for the analytics sidebar (`?project=` for one project's). */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/dashboards">) {
  const { ws } = await params;
  const project = z
    .uuid()
    .nullable()
    .catch(null)
    .parse(new URL(req.url).searchParams.get("project"));
  return api(ws, (ctx) => listDashboards(ctx, project));
}
