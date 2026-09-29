import { AuditFilterSchema } from "@dopl/shared/schemas/agent";
import { api } from "@/server/api";
import { listAuditLogs } from "@/server/queries/agent";

/** Settings → Audit log: one page, newest first (?action=&actorId=&from=&to=&cursor=). */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/audit">) {
  const { ws } = await params;
  const sp = new URL(req.url).searchParams;
  const filter = AuditFilterSchema.parse({
    action: sp.get("action") || undefined,
    actorId: sp.get("actorId") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    cursor: sp.get("cursor") || undefined,
  });
  return api(ws, (ctx) => listAuditLogs(ctx, filter));
}
