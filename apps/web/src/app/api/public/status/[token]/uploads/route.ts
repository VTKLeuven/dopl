import { forbidden, foreignOrigin, respond } from "@/server/public/respond";
import { clientIp } from "@/server/rate-limit";
import { uploadStatusFile } from "@/server/services/public-intake";

export async function POST(
  req: Request,
  { params }: RouteContext<"/api/public/status/[token]/uploads">,
) {
  if (foreignOrigin(req)) return forbidden();
  const { token } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "invalid_input" }, { status: 400 });
  const result = await uploadStatusFile(token, file, {
    ip: clientIp(req.headers),
    userAgent: req.headers.get("user-agent"),
  });
  return respond(result, 201);
}
