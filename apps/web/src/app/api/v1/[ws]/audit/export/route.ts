import { AuditFilterSchema } from "@dopl/shared/schemas/agent";
import { db } from "@/server/db";
import { exportAuditLogs } from "@/server/queries/agent";
import { getWorkspaceCtx, needsTwoFactorEnrollment } from "@/server/session";

const COLUMNS = [
  "createdAt",
  "actorType",
  "actorId",
  "actorLabel",
  "action",
  "targetType",
  "targetId",
  "ip",
  "metadata",
] as const;

/** RFC 4180 field; a leading =+-@ is prefixed so spreadsheets don't run it as a formula. */
function csvField(v: unknown): string {
  let s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * Settings → Audit log → Export (ARCHITECTURE §8.4): CSV or JSON of the
 * filtered log, admins only. The export itself is audit-logged.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/audit/export">) {
  const { ws } = await params;
  const ctx = await getWorkspaceCtx(ws);
  if (!ctx) return Response.json({ error: "not_found" }, { status: 404 });
  if (await needsTwoFactorEnrollment(ctx))
    return Response.json({ error: "two_factor_required" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const parsed = AuditFilterSchema.safeParse({
    action: sp.get("action") || undefined,
    actorId: sp.get("actorId") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
  });
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
  const format = sp.get("format") === "json" ? "json" : "csv";
  let rows;
  try {
    rows = await exportAuditLogs(ctx, parsed.data);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  await db.auditLog.create({
    data: {
      workspaceId: ctx.workspace.id,
      actorType: "USER",
      actorId: ctx.actor.userId,
      actorLabel: `${ctx.actor.name} <${ctx.actor.email}>`,
      action: "audit.exported",
      metadata: { format, filter: parsed.data, rows: rows.length },
    },
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const body =
    format === "json"
      ? JSON.stringify(rows, null, 2)
      : [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvField(r[c])).join(","))].join(
          "\r\n",
        );
  return new Response(body, {
    headers: {
      "Content-Type": format === "json" ? "application/json" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dopl-audit-${ws}-${stamp}.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
