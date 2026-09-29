import { api } from "@/server/api";
import { getThread } from "@/server/queries/mail";

export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/v1/[ws]/mail/threads/[id]">,
) {
  const { ws, id } = await params;
  return api(ws, (ctx) => getThread(ctx, id));
}
