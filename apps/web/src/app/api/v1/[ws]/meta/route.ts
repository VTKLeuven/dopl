import { api } from "@/server/api";
import { getWorkspaceMeta } from "@/server/queries/workspace-items";

export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/meta">) {
  const { ws } = await params;
  return api(ws, getWorkspaceMeta);
}
