import "server-only";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import { CreateProjectSchema, type CreateProjectInput } from "@dopl/shared/schemas/project";
import { defaultLabels, defaultStates } from "@dopl/shared/defaults";
import { keyAfter, keysBetween } from "@dopl/shared/sort-keys";
import { ConflictError } from "../action-result";
import { withMutation } from "../mutation";
import type { WorkspaceCtx } from "../session";

export async function createProject(ctx: WorkspaceCtx, raw: CreateProjectInput) {
  if (!canWorkspace(ctx.policyActor, "project.create")) throw new ForbiddenError();
  const input = CreateProjectSchema.parse(raw);

  return withMutation(ctx, async ({ tx, activity, emit }) => {
    const clash = await tx.project.findFirst({
      where: {
        workspaceId: ctx.workspace.id,
        OR: [{ identifier: input.identifier }, { previousIdentifiers: { has: input.identifier } }],
      },
      select: { id: true },
    });
    if (clash) throw new ConflictError("identifier_taken");

    const project = await tx.project.create({
      data: {
        workspaceId: ctx.workspace.id,
        identifier: input.identifier,
        name: input.name,
        color: input.color,
        visibility: input.visibility,
        description: input.description ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: input.description }] }] } : undefined,
        leadId: ctx.actor.userId,
        createdById: ctx.actor.userId,
      },
      select: { id: true, identifier: true, name: true },
    });

    const stateKeys = keysBetween(null, null, defaultStates.length);
    await tx.workflowState.createMany({
      data: defaultStates.map((s, i) => ({
        projectId: project.id,
        workspaceId: ctx.workspace.id,
        name: s.name,
        group: s.group,
        color: s.color,
        isDefault: s.isDefault ?? false,
        sortKey: stateKeys[i] ?? keyAfter(null),
      })),
    });
    const labelKeys = keysBetween(null, null, defaultLabels.length);
    await tx.label.createMany({
      data: defaultLabels.map((l, i) => ({
        workspaceId: ctx.workspace.id,
        projectId: project.id,
        name: l.name,
        color: l.color,
        sortKey: labelKeys[i] ?? keyAfter(null),
      })),
    });

    const last = await tx.projectMember.findFirst({
      where: { userId: ctx.actor.userId, workspaceId: ctx.workspace.id },
      orderBy: { sortKey: "desc" },
      select: { sortKey: true },
    });
    await tx.projectMember.create({
      data: {
        projectId: project.id,
        workspaceId: ctx.workspace.id,
        userId: ctx.actor.userId,
        role: "ADMIN",
        sortKey: keyAfter(last?.sortKey ?? null),
      },
    });
    await tx.channel.create({
      data: { workspaceId: ctx.workspace.id, kind: "PROJECT", projectId: project.id, name: project.name, createdById: ctx.actor.userId },
    });

    activity({ entityType: "PROJECT", entityId: project.id, projectId: project.id, verb: "created", meta: { name: project.name, identifier: project.identifier } });
    emit({ topic: `workspace:${ctx.workspace.id}`, type: "project.created", payload: { id: project.id } });
    return project;
  });
}
