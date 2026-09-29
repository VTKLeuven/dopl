import { api } from "@/server/api";
import { attachToWorkItem } from "@/server/services/attachments";

/** Multipart upload (field "file"). `ref` is the work item id here. */
export async function POST(req: Request, { params }: RouteContext<"/api/v1/[ws]/items/[ref]/attachments">) {
  const { ws, ref } = await params;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin && origin !== process.env.APP_URL) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "invalid_input" }, { status: 400 });
  return api(ws, (ctx) => attachToWorkItem(ctx, ref, file));
}
