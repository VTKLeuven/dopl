import { api } from "@/server/api";
import { projectAccessById } from "@/server/queries/projects";
import { listBlockingRelations } from "@/server/queries/work-items";

/** BLOCKS relations inside one project, for timeline dependency arrows. */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/v1/[ws]/projects/[projectId]/relations">,
) {
  const { ws, projectId } = await params;
  return api(ws, async (ctx) => {
    const access = await projectAccessById(ctx, projectId);
    return listBlockingRelations(access);
  });
}
