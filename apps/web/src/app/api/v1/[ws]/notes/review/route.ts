import { api } from "@/server/api";
import { getReview } from "@/server/queries/notes";

/** Today's resurfacing set (computed on read). */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/notes/review">) {
  const { ws } = await params;
  return api(ws, (ctx) => getReview(ctx));
}
