import "server-only";
import { ForbiddenError } from "@dopl/shared/policy";
import { ZodError } from "zod";
import { NotFoundError } from "./action-result";
import { getActor, getWorkspaceCtx, needsTwoFactorEnrollment, type WorkspaceCtx } from "./session";

/**
 * Session-authenticated JSON reads for TanStack Query refetches (D-054).
 * Same policy layer as pages; errors map to status codes without details.
 */
export async function api<T>(ws: string, fn: (ctx: WorkspaceCtx) => Promise<T>): Promise<Response> {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await getWorkspaceCtx(ws);
  if (!ctx) return Response.json({ error: "not_found" }, { status: 404 });
  if (await needsTwoFactorEnrollment(ctx)) return Response.json({ error: "two_factor_required" }, { status: 403 });
  try {
    return Response.json(await fn(ctx), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    if (err instanceof NotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    if (err instanceof ForbiddenError) return Response.json({ error: "forbidden" }, { status: 403 });
    if (err instanceof ZodError) return Response.json({ error: "invalid_input" }, { status: 400 });
    if (err && typeof err === "object" && "digest" in err) {
      // notFound() from shared loaders
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    console.error("[api]", err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
