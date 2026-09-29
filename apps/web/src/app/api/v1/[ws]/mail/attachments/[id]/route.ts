import { ForbiddenError } from "@dopl/shared/policy";
import { NotFoundError } from "@/server/action-result";
import { getActor, getWorkspaceCtx } from "@/server/session";
import { AttachmentTimeoutError, resolveEmailAttachment } from "@/server/services/mail";
import { serveAttachment } from "@/server/storage/serve";

/**
 * An email attachment. The first open asks the worker to fetch it from Gmail
 * (the web app holds no Google credentials, D-027) and waits a moment.
 */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/v1/[ws]/mail/attachments/[id]">,
) {
  const { ws, id } = await params;
  if (!(await getActor())) return new Response("Unauthorized", { status: 401 });
  const ctx = await getWorkspaceCtx(ws);
  if (!ctx) return new Response("Not found", { status: 404 });
  try {
    return serveAttachment(await resolveEmailAttachment(ctx, id));
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError)
      return new Response("Not found", { status: 404 });
    if (err instanceof AttachmentTimeoutError)
      return new Response("The attachment is still downloading. Try again in a moment.", {
        status: 504,
      });
    throw err;
  }
}
