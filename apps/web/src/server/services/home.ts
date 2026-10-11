import "server-only";
import type { Prisma } from "@dopl/db";
import { layoutProblem } from "@dopl/shared/domain/home";
import { SaveHomeLayoutSchema } from "@dopl/shared/schemas/home";
import { ConflictError, NotFoundError } from "../action-result";
import { withMutation } from "../mutation";
import { PreferencesSchema } from "../queries/home";
import type { WorkspaceCtx } from "../session";

/*
 * Home's layout is a personal UI preference, like view preferences: no
 * Activity rows and no audit entry, but every save emits `home.layout` on the
 * member's user topic so Home in their other tabs follows.
 */

/** Saves the member's Home widgets; `layout: null` goes back to the default. */
export async function saveHomeLayout(ctx: WorkspaceCtx, raw: unknown) {
  const { layout } = SaveHomeLayoutSchema.parse(raw);
  if (layout) {
    const problem = layoutProblem(layout);
    if (problem) throw new ConflictError(problem);
  }
  return withMutation(ctx, async (m) => {
    const where = {
      workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.actor.userId },
    };
    // Serialize saves from two tabs so neither drops the other's other preferences.
    await m.tx.$queryRaw`SELECT id FROM workspace_members
      WHERE "workspaceId" = ${ctx.workspace.id}::uuid AND "userId" = ${ctx.actor.userId}::uuid
      FOR UPDATE`;
    const member = await m.tx.workspaceMember.findUnique({ where, select: { preferences: true } });
    if (!member) throw new NotFoundError();
    const preferences = PreferencesSchema.parse(member.preferences);
    if (layout) preferences.home = layout;
    else delete preferences.home;
    await m.tx.workspaceMember.update({
      where,
      data: { preferences: preferences as Prisma.InputJsonValue },
    });
    m.emit({ topic: `user:${ctx.actor.userId}`, type: "home.layout", payload: {} });
    return { custom: layout !== null };
  });
}
