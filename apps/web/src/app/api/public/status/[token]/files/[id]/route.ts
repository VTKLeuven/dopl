import { resolveStatusDownload } from "@/server/services/public-intake";
import { serveAttachment } from "@/server/storage/serve";

/** A contact downloads a file they attached to their own request. */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/public/status/[token]/files/[id]">,
) {
  const { token, id } = await params;
  const a = await resolveStatusDownload(token, id);
  if (!a) return new Response("Not found", { status: 404 });
  return serveAttachment(a);
}
