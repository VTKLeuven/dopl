import "server-only";
import { blobStore, INLINE_SAFE } from "./index";

/**
 * Sends an attachment the caller has already authorized: S3 → 302 to a
 * 5-minute signed URL; local → streamed. Only known-safe types render inline.
 */
export async function serveAttachment(a: {
  storageKey: string;
  filename: string;
  mimeType: string;
}): Promise<Response> {
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
