import { forbidden, foreignOrigin, respond } from "@/server/public/respond";
import { clientIp } from "@/server/rate-limit";
import { submitPublicForm } from "@/server/services/public-intake";

/** Public form submission (ARCHITECTURE §6). Rate-limited and idempotent. */
export async function POST(
  req: Request,
  { params }: RouteContext<"/api/public/forms/[slug]/submit">,
) {
  if (foreignOrigin(req)) return forbidden();
  const { slug } = await params;
  const body: unknown = await req.json().catch(() => null);
  const result = await submitPublicForm(slug, body, {
    ip: clientIp(req.headers),
    userAgent: req.headers.get("user-agent"),
  });
  return respond(result, 201);
}
