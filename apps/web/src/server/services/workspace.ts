import "server-only";
import { z } from "zod";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import { audit, withMutation } from "../mutation";
import type { WorkspaceCtx } from "../session";

const UpdateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
});

export async function updateWorkspace(ctx: WorkspaceCtx, raw: unknown) {
  if (!canWorkspace(ctx.policyActor, "workspace.settings")) throw new ForbiddenError();
  const input = UpdateWorkspaceSchema.parse(raw);
  return withMutation(ctx, async ({ tx, activity, emit }) => {
    await tx.workspace.update({ where: { id: ctx.workspace.id }, data: input });
    await audit(tx, ctx, { action: "workspace.updated", targetType: "Workspace", targetId: ctx.workspace.id, metadata: input });
    activity({ entityType: "WORKSPACE", entityId: ctx.workspace.id, verb: "updated", toValue: input });
    emit({ topic: `workspace:${ctx.workspace.id}`, type: "workspace.updated", payload: {} });
  });
}
