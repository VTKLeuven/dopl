import { api } from "@/server/api";
import { projectAccessById } from "@/server/queries/projects";
import { listProjectItems, parseItemsQuery } from "@/server/queries/work-items";

export async function GET(
  req: Request,
  { params }: RouteContext<"/api/v1/[ws]/projects/[projectId]/items">,
) {
  const { ws, projectId } = await params;
  const query = parseItemsQuery(new URL(req.url).searchParams);
  return api(ws, async (ctx) => {
    const access = await projectAccessById(ctx, projectId);
    return listProjectItems(ctx, access, query);
  });
}
