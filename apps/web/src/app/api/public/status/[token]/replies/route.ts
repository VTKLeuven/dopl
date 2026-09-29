import { forbidden, foreignOrigin, respond } from "@/server/public/respond";
import { clientIp } from "@/server/rate-limit";
import { postStatusReply } from "@/server/services/public-intake";

/** A contact's reply from the status page (becomes a PUBLIC comment). */
export async function POST(
  req: Request,
  { params }: RouteContext<"/api/public/status/[token]/replies">,
) {
  if (foreignOrigin(req)) return forbidden();
  const { token } = await params;
  const body: unknown = await req.json().catch(() => null);
  const result = await postStatusReply(token, body, {
    ip: clientIp(req.headers),
    userAgent: req.headers.get("user-agent"),
  });
  return respond(result, 201);
}
