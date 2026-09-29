import { api } from "@/server/api";
import { listTags } from "@/server/queries/notes";

/** The actor's tag tree (flat rows; the client nests them by path). */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/notes/tags">) {
  const { ws } = await params;
  return api(ws, listTags);
}
