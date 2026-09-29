import { api } from "@/server/api";
import { projectAccessById } from "@/server/queries/projects";
import { listProjectItems, type CompletedMode } from "@/server/queries/work-items";

export async function GET(
  req: Request,
  { params }: RouteContext<"/api/v1/[ws]/projects/[projectId]/items">,
) {
  const { ws, projectId } = await params;
  const mode = (new URL(req.url).searchParams.get("completed") ?? "hide") as CompletedMode;
  return api(ws, async (ctx) => {
    const access = await projectAccessById(ctx, projectId);
    return listProjectItems(access, ["hide", "recent", "show"].includes(mode) ? mode : "hide");
  });
}
