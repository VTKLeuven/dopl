import { api } from "@/server/api";
import { setAgentAvatar } from "@/server/services/agent";

function crossOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return Boolean(origin && origin !== new URL(req.url).origin && origin !== process.env.APP_URL);
}

/** Settings → AI teammate: upload a profile picture (multipart, field "file"). */
export async function POST(req: Request, { params }: RouteContext<"/api/v1/[ws]/agent/avatar">) {
  const { ws } = await params;
  if (crossOrigin(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "invalid_input" }, { status: 400 });
  return api(ws, (ctx) => setAgentAvatar(ctx, file));
}

/** Back to the Dopl mark. */
export async function DELETE(req: Request, { params }: RouteContext<"/api/v1/[ws]/agent/avatar">) {
  const { ws } = await params;
  if (crossOrigin(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  return api(ws, (ctx) => setAgentAvatar(ctx, null));
}
