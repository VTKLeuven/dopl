"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import { saveHomeLayout } from "../services/home";

/** Saves the member's Home widgets (`{ layout: null }` resets to the default). */
export async function saveHomeLayoutAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => saveHomeLayout(ctx, input));
}
