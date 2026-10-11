import { z } from "zod";
import { api } from "@/server/api";
import { getViewPreview } from "@/server/queries/home";

/** The first rows of a saved view, for Home's view widget. */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/v1/[ws]/views/[id]/preview">,
) {
  const { ws, id } = await params;
  return api(ws, (ctx) => getViewPreview(ctx, z.uuid().parse(id)));
}
