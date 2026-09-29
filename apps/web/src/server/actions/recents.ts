"use server";

import { z } from "zod";
import { run, type ActionResult } from "../action-result";
import { db } from "../db";
import { requireWorkspaceCtx } from "../session";

const VisitSchema = z.object({
  type: z.enum(["WORK_ITEM", "PROJECT", "VIEW"]),
  id: z.uuid(),
});

/**
 * Remembers what the user opened, for "Recent" in ⌘K. Access is checked when
 * recents are read, so recording a visit needs no policy check of its own.
 */
export async function recordVisitAction(ws: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireWorkspaceCtx(ws);
  return run(async () => {
    const { type, id } = VisitSchema.parse(input);
    await db.recentVisit.upsert({
      where: {
        userId_entityType_entityId: { userId: ctx.actor.userId, entityType: type, entityId: id },
      },
      create: {
        userId: ctx.actor.userId,
        workspaceId: ctx.workspace.id,
        entityType: type,
        entityId: id,
      },
      update: { visitedAt: new Date() },
    });
    return null;
  });
}
