import { NotFoundError } from "@/server/action-result";
import { getActor, getWorkspaceCtx } from "@/server/session";
import { resolveDownload } from "@/server/services/attachments";
import { blobStore, INLINE_SAFE } from "@/server/storage";

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
  const inline = INLINE_SAFE.has(a.mimeType);
  const contentType = inline ? a.mimeType : "application/octet-stream";
  const disposition = inline ? "inline" : "attachment";
  const store = blobStore();
  const url = await store.signedUrl(a.storageKey, {
    filename: a.filename,
    disposition,
    contentType,
  });
  if (url) return Response.redirect(url, 302);
  const stream = await store.stream(a.storageKey);
  if (!stream) return new Response("Not found", { status: 404 });
  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
