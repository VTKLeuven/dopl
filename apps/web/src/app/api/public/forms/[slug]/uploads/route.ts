import { forbidden, foreignOrigin, respond } from "@/server/public/respond";
import { clientIp } from "@/server/rate-limit";
import { uploadPublicFile } from "@/server/services/public-intake";

/** One file per request; quarantined until the submission that claims it commits. */
export async function POST(
  req: Request,
  { params }: RouteContext<"/api/public/forms/[slug]/uploads">,
) {
  if (foreignOrigin(req)) return forbidden();
  const { slug } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const clientSubmissionId = form?.get("clientSubmissionId");
  if (!(file instanceof File) || typeof clientSubmissionId !== "string")
    return Response.json({ error: "invalid_input" }, { status: 400 });
  const result = await uploadPublicFile(
    slug,
    { clientSubmissionId, file },
    { ip: clientIp(req.headers), userAgent: req.headers.get("user-agent") },
  );
  return respond(result, 201);
}
