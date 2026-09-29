import { NotFoundError } from "@/server/action-result";
import { getActor, getWorkspaceCtx } from "@/server/session";
import { resolveDownload } from "@/server/services/attachments";
import { serveAttachment } from "@/server/storage/serve";

/** Policy-checked download: S3 → 302 to a 5-minute signed URL; local → streamed. */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/files/[id]">) {
  const { ws, id } = await params;
  if (!(await getActor())) return new Response("Unauthorized", { status: 401 });
  const ctx = await getWorkspaceCtx(ws);
  if (!ctx) return new Response("Not found", { status: 404 });
  let a;
  try {
    a = await resolveDownload(ctx, id);
  } catch (err) {
    if (err instanceof NotFoundError) return new Response("Not found", { status: 404 });
    throw err;
  }
  return serveAttachment(a);
}
