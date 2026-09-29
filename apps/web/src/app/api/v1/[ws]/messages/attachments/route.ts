import { api } from "@/server/api";
import { uploadMessageAttachment } from "@/server/services/messages";

/** Multipart upload (field "file") for the chat composer; sending the message claims it. */
export async function POST(
  req: Request,
  { params }: RouteContext<"/api/v1/[ws]/messages/attachments">,
) {
  const { ws } = await params;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin && origin !== process.env.APP_URL)
    return Response.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "invalid_input" }, { status: 400 });
  return api(ws, (ctx) => uploadMessageAttachment(ctx, file));
}
