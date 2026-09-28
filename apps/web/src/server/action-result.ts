import "server-only";
import { ForbiddenError } from "@dopl/shared/policy";
import { z } from "zod";

export type ActionError = "invalid_input" | "forbidden" | "not_found" | "conflict" | "server_error";
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ActionError; message?: string; fields?: Record<string, string[]> };

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/** Maps thrown domain errors to typed results so actions never leak internals. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: "invalid_input", fields: z.flattenError(err).fieldErrors as Record<string, string[]> };
    }
    if (err instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    if (err instanceof NotFoundError) return { ok: false, error: "not_found" };
    if (err instanceof ConflictError) return { ok: false, error: "conflict", message: err.message };
    // Next's redirect()/notFound() throw special errors that must propagate.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("[action]", err);
    return { ok: false, error: "server_error" };
  }
}
