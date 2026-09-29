"use server";

import { refresh } from "next/cache";
import { run, type ActionResult } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import { createProject } from "../services/projects";

export async function createProjectAction(
  ws: string,
  input: unknown,
): Promise<ActionResult<{ identifier: string }>> {
  const ctx = await requireWorkspaceCtx(ws);
  const result = await run(async () => {
    const p = await createProject(ctx, input as never);
    return { identifier: p.identifier };
  });
  if (result.ok) refresh();
  return result;
}
