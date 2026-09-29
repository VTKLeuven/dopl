import { api } from "@/server/api";
import { projectAccessById } from "@/server/queries/projects";
import { getProjectMeta } from "@/server/queries/work-items";

export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/projects/[projectId]/meta">) {
  const { ws, projectId } = await params;
  return api(ws, async (ctx) => getProjectMeta(ctx, await projectAccessById(ctx, projectId)));
}
