import { api } from "@/server/api";
import { listPeople } from "@/server/queries/channels";

/** People you can DM or @mention in chat (non-guest members and the AI teammate). */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/people">) {
  const { ws } = await params;
  return api(ws, (ctx) => listPeople(ctx));
}
