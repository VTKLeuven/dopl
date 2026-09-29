import "server-only";
import { z } from "zod";
import { ForbiddenError } from "@dopl/shared/policy";
import { UpdateProjectSchema } from "@dopl/shared/schemas/project";
import { StateGroupSchema } from "@dopl/shared/schemas/work-item";
import { TagColorSchema } from "@dopl/shared/palette";
import { keyAfter, keyBetween } from "@dopl/shared/sort-keys";
import { ConflictError, NotFoundError } from "../action-result";
import { audit, withMutation } from "../mutation";
import { projectAccessById } from "../queries/projects";
import type { WorkspaceCtx } from "../session";

async function manageable(ctx: WorkspaceCtx, projectId: string) {
  const access = await projectAccessById(ctx, projectId);
  if (!access.can("project.manage")) throw new ForbiddenError();
  return access;
}

export async function updateProject(ctx: WorkspaceCtx, raw: unknown) {
  const input = UpdateProjectSchema.parse(raw);
  const access = await manageable(ctx, input.projectId);
  return withMutation(ctx, async ({ tx, activity, emit }) => {
    const current = await tx.project.findUniqueOrThrow({
      where: { id: access.project.id },
      select: { identifier: true, previousIdentifiers: true },
    });
    const data: Record<string, unknown> = {};
    for (const k of [
      "name",
      "color",
      "visibility",
      "guestsCanViewProject",
      "estimateSystem",
      "leadId",
    ] as const) {
      if (input[k] !== undefined) data[k] = input[k];
    }
    if (input.identifier && input.identifier !== current.identifier) {
      const clash = await tx.project.findFirst({
        where: {
          workspaceId: ctx.workspace.id,
          id: { not: access.project.id },
          OR: [
            { identifier: input.identifier },
            { previousIdentifiers: { has: input.identifier } },
          ],
        },
        select: { id: true },
      });
      if (clash) throw new ConflictError("identifier_taken");
      data.identifier = input.identifier;
      data.previousIdentifiers = Array.from(
        new Set([...current.previousIdentifiers, current.identifier]),
      ).filter((i) => i !== input.identifier);
    }
    await tx.project.update({ where: { id: access.project.id }, data });
    activity({
      entityType: "PROJECT",
      entityId: access.project.id,
      projectId: access.project.id,
      verb: "updated",
      toValue: JSON.parse(JSON.stringify(data)),
    });
    emit({
      topic: `workspace:${ctx.workspace.id}`,
      type: "project.updated",
      payload: { id: access.project.id },
    });
    return { identifier: (data.identifier as string | undefined) ?? current.identifier };
  });
}

export async function setProjectArchived(ctx: WorkspaceCtx, projectId: string, archived: boolean) {
  const access = await manageable(ctx, projectId);
  return withMutation(ctx, async ({ tx, activity, emit }) => {
    await tx.project.update({
      where: { id: access.project.id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await audit(tx, ctx, {
      action: archived ? "project.archived" : "project.unarchived",
      targetType: "Project",
      targetId: access.project.id,
    });
    activity({
      entityType: "PROJECT",
      entityId: access.project.id,
      projectId: access.project.id,
      verb: archived ? "archived" : "unarchived",
    });
    emit({
      topic: `workspace:${ctx.workspace.id}`,
      type: "project.updated",
      payload: { id: access.project.id },
    });
  });
}

/* ───────── states ───────── */
const StateInput = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(40),
  group: StateGroupSchema.exclude(["TRIAGE"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
const StateUpdate = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  isDefault: z.literal(true).optional(),
});

export async function createState(ctx: WorkspaceCtx, raw: unknown) {
  const input = StateInput.parse(raw);
  await manageable(ctx, input.projectId);
  return withMutation(ctx, async ({ tx, activity }) => {
    const last = await tx.workflowState.findFirst({
      where: { projectId: input.projectId },
      orderBy: { sortKey: "desc" },
      select: { sortKey: true },
    });
    // Insert after the last state of the same group so groups stay together.
    const lastInGroup = await tx.workflowState.findFirst({
      where: { projectId: input.projectId, group: input.group },
      orderBy: { sortKey: "desc" },
      select: { sortKey: true },
    });
    const next = await tx.workflowState.findFirst({
      where: {
        projectId: input.projectId,
        sortKey: { gt: lastInGroup?.sortKey ?? last?.sortKey ?? "" },
      },
      orderBy: { sortKey: "asc" },
      select: { sortKey: true },
    });
    const sortKey = lastInGroup
      ? keyBetween(lastInGroup.sortKey, next?.sortKey ?? null)
      : keyAfter(last?.sortKey ?? null);
    const s = await tx.workflowState.create({
      data: {
        projectId: input.projectId,
        workspaceId: ctx.workspace.id,
        name: input.name,
        group: input.group,
        color: input.color,
        sortKey,
      },
      select: { id: true },
    });
    activity({
      entityType: "STATE",
      entityId: s.id,
      projectId: input.projectId,
      verb: "created",
      meta: { name: input.name },
    });
    return s;
  });
}

export async function updateState(ctx: WorkspaceCtx, raw: unknown) {
  const input = StateUpdate.parse(raw);
  return withMutation(ctx, async ({ tx, activity }) => {
    const state = await tx.workflowState.findFirst({
      where: { id: input.id, workspaceId: ctx.workspace.id },
    });
    if (!state || state.group === "TRIAGE") throw new NotFoundError();
    await manageable(ctx, state.projectId);
    if (input.isDefault)
      await tx.workflowState.updateMany({
        where: { projectId: state.projectId },
        data: { isDefault: false },
      });
    await tx.workflowState.update({
      where: { id: state.id },
      data: { name: input.name, color: input.color, isDefault: input.isDefault },
    });
    activity({
      entityType: "STATE",
      entityId: state.id,
      projectId: state.projectId,
      verb: "updated",
      meta: { name: input.name ?? state.name },
    });
  });
}

export async function deleteState(ctx: WorkspaceCtx, stateId: string, reassignToId: string) {
  return withMutation(ctx, async ({ tx, activity, emit }) => {
    const state = await tx.workflowState.findFirst({
      where: { id: stateId, workspaceId: ctx.workspace.id },
    });
    if (!state || state.group === "TRIAGE") throw new NotFoundError();
    await manageable(ctx, state.projectId);
    const target = await tx.workflowState.findFirst({
      where: { id: reassignToId, projectId: state.projectId, group: { not: "TRIAGE" } },
    });
    if (!target || target.id === state.id) throw new ConflictError("invalid_target");
    const sameGroup = await tx.workflowState.count({
      where: { projectId: state.projectId, group: state.group },
    });
    if (sameGroup <= 1) throw new ConflictError("last_in_group");
    await tx.workItem.updateMany({
      where: { stateId: state.id },
      data: { stateId: target.id, stateGroup: target.group },
    });
    if (state.isDefault)
      await tx.workflowState.update({ where: { id: target.id }, data: { isDefault: true } });
    await tx.workflowState.delete({ where: { id: state.id } });
    activity({
      entityType: "STATE",
      entityId: state.id,
      projectId: state.projectId,
      verb: "deleted",
      meta: { name: state.name, reassignedTo: target.name },
    });
    emit({ topic: `project:${state.projectId}`, type: "project.states", payload: {} });
  });
}

/* ───────── labels ───────── */
const LabelInput = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(40),
  color: TagColorSchema,
});
const LabelUpdate = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40).optional(),
  color: TagColorSchema.optional(),
});

export async function createLabel(ctx: WorkspaceCtx, raw: unknown) {
  const input = LabelInput.parse(raw);
  await manageable(ctx, input.projectId);
  return withMutation(ctx, async ({ tx, activity }) => {
    const exists = await tx.label.findFirst({
      where: { projectId: input.projectId, name: { equals: input.name, mode: "insensitive" } },
    });
    if (exists) throw new ConflictError("label_exists");
    const last = await tx.label.findFirst({
      where: { projectId: input.projectId },
      orderBy: { sortKey: "desc" },
      select: { sortKey: true },
    });
    const l = await tx.label.create({
      data: {
        workspaceId: ctx.workspace.id,
        projectId: input.projectId,
        name: input.name,
        color: input.color,
        sortKey: keyAfter(last?.sortKey ?? null),
      },
      select: { id: true },
    });
    activity({
      entityType: "LABEL",
      entityId: l.id,
      projectId: input.projectId,
      verb: "created",
      meta: { name: input.name, color: input.color },
    });
    return l;
  });
}

export async function updateLabel(ctx: WorkspaceCtx, raw: unknown) {
  const input = LabelUpdate.parse(raw);
  return withMutation(ctx, async ({ tx }) => {
    const label = await tx.label.findFirst({
      where: { id: input.id, workspaceId: ctx.workspace.id },
    });
    if (!label?.projectId) throw new NotFoundError();
    await manageable(ctx, label.projectId);
    await tx.label.update({
      where: { id: label.id },
      data: { name: input.name, color: input.color },
    });
  });
}

export async function deleteLabel(ctx: WorkspaceCtx, labelId: string) {
  return withMutation(ctx, async ({ tx, activity }) => {
    const label = await tx.label.findFirst({
      where: { id: labelId, workspaceId: ctx.workspace.id },
    });
    if (!label?.projectId) throw new NotFoundError();
    await manageable(ctx, label.projectId);
    await tx.label.delete({ where: { id: label.id } });
    activity({
      entityType: "LABEL",
      entityId: label.id,
      projectId: label.projectId,
      verb: "deleted",
      meta: { name: label.name, color: label.color },
    });
  });
}

/* ───────── members ───────── */
const MemberInput = z.object({
  projectId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["ADMIN", "MEMBER", "GUEST"]),
});

export async function setProjectMember(ctx: WorkspaceCtx, raw: unknown) {
  const input = MemberInput.parse(raw);
  await manageable(ctx, input.projectId);
  return withMutation(ctx, async ({ tx, activity }) => {
    const wsMember = await tx.workspaceMember.findFirst({
      where: {
        workspaceId: ctx.workspace.id,
        userId: input.userId,
        status: { not: "DEACTIVATED" },
      },
    });
    if (!wsMember) throw new NotFoundError();
    const role = wsMember.role === "GUEST" ? "GUEST" : input.role;
    const last = await tx.projectMember.findFirst({
      where: { userId: input.userId, workspaceId: ctx.workspace.id },
      orderBy: { sortKey: "desc" },
      select: { sortKey: true },
    });
    await tx.projectMember.upsert({
      where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
      create: {
        projectId: input.projectId,
        workspaceId: ctx.workspace.id,
        userId: input.userId,
        role,
        sortKey: keyAfter(last?.sortKey ?? null),
      },
      update: { role },
    });
    activity({
      entityType: "PROJECT",
      entityId: input.projectId,
      projectId: input.projectId,
      verb: "member_set",
      meta: { userId: input.userId, role },
    });
  });
}

export async function removeProjectMember(ctx: WorkspaceCtx, projectId: string, userId: string) {
  await manageable(ctx, projectId);
  return withMutation(ctx, async ({ tx, activity }) => {
    const admins = await tx.projectMember.count({
      where: { projectId, role: "ADMIN", userId: { not: userId } },
    });
    const target = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!target) throw new NotFoundError();
    if (target.role === "ADMIN" && admins === 0 && ctx.role !== "OWNER" && ctx.role !== "ADMIN")
      throw new ConflictError("last_admin");
    await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
    activity({
      entityType: "PROJECT",
      entityId: projectId,
      projectId,
      verb: "member_removed",
      meta: { userId },
    });
  });
}
