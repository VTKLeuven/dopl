import { z } from "zod";
import { api } from "@/server/api";
import { getThread } from "@/server/queries/channels";

/** A thread: its root message and every reply. */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/v1/[ws]/threads/[rootId]">,
) {
  const { ws, rootId } = await params;
  return api(ws, (ctx) => getThread(ctx, z.uuid().parse(rootId)));
}
