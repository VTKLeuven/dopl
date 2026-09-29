import "server-only";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import {
  InviteMembersSchema,
  ChangeRoleSchema,
  SetApproverSchema,
  type InviteMembersInput,
} from "@dopl/shared/schemas/members";
import { generateToken, hashToken } from "@dopl/shared/crypto";
import { INVITE_TTL_MS } from "@dopl/shared/defaults";
import { keyAfter } from "@dopl/shared/sort-keys";
import type { TransactionClient } from "@dopl/db";
import { ConflictError, NotFoundError } from "../action-result";
import { queueEmail } from "../email/outbox";
import { env } from "../env";
import { audit, withMutation } from "../mutation";
import type { WorkspaceCtx } from "../session";

function assertAdmin(ctx: WorkspaceCtx) {
  if (!canWorkspace(ctx.policyActor, "workspace.members.manage")) throw new ForbiddenError();
}

async function issueInvite(
  tx: TransactionClient,
  ctx: WorkspaceCtx,
  args: { email: string; role: InviteMembersInput["role"] & string; projectIds: string[] },
) {
  const token = generateToken();
  const invite = await tx.workspaceInvite.create({
    data: {
      workspaceId: ctx.workspace.id,
      email: args.email,
      role: args.role,
      projectIds: args.projectIds,
      tokenHash: hashToken(token),
      invitedById: ctx.actor.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    select: { id: true },
  });
  await queueEmail(tx, {
    template: "auth.invite",
    to: args.email,
    workspaceId: ctx.workspace.id,
    data: {
      workspaceName: ctx.workspace.name,
      inviterName: ctx.actor.name,
      role: args.role.charAt(0) + args.role.slice(1).toLowerCase(),
      url: `${env.APP_URL}/invite/${token}`,
    },
  });
  return invite;
}

export async function inviteMembers(ctx: WorkspaceCtx, raw: InviteMembersInput) {
  assertAdmin(ctx);
  const input = InviteMembersSchema.parse(raw);
  if (input.role === "OWNER" && ctx.role !== "OWNER") throw new ForbiddenError();

  return withMutation(ctx, async ({ tx, activity }) => {
    const projects = await tx.project.findMany({
      where: { id: { in: input.projectIds }, workspaceId: ctx.workspace.id },
      select: { id: true },
    });
    const skipped: string[] = [];
    let invited = 0;
    for (const email of input.emails) {
      const user =
        (await tx.user.findUnique({ where: { email }, select: { id: true, kind: true } })) ??
        (await tx.user.create({
          data: { email, name: email.split("@")[0] ?? email },
          select: { id: true, kind: true },
        }));
      if (user.kind !== "HUMAN") {
        skipped.push(email);
        continue;
      }
      const existing = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: user.id } },
        select: { status: true },
      });
      if (existing?.status === "ACTIVE") {
        skipped.push(email);
        continue;
      }
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: user.id } },
        create: {
          workspaceId: ctx.workspace.id,
          userId: user.id,
          role: input.role,
          status: "INVITED",
        },
        update: { role: input.role, status: "INVITED", deactivatedAt: null },
      });
      // Revoke older pending invites for this address; the new link replaces them.
      await tx.workspaceInvite.updateMany({
        where: { workspaceId: ctx.workspace.id, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      for (const project of projects) {
        const last = await tx.projectMember.findFirst({
          where: { userId: user.id, workspaceId: ctx.workspace.id },
          orderBy: { sortKey: "desc" },
          select: { sortKey: true },
        });
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId: user.id } },
          create: {
            projectId: project.id,
            workspaceId: ctx.workspace.id,
            userId: user.id,
            role: input.role === "GUEST" ? "GUEST" : "MEMBER",
            sortKey: keyAfter(last?.sortKey ?? null),
          },
          update: {},
        });
      }
      const invite = await issueInvite(tx, ctx, {
        email,
        role: input.role,
        projectIds: projects.map((p) => p.id),
      });
      await audit(tx, ctx, {
        action: "member.invited",
        targetType: "WorkspaceInvite",
        targetId: invite.id,
        metadata: { email, role: input.role },
      });
      activity({
        entityType: "MEMBER",
        entityId: user.id,
        verb: "invited",
        meta: { email, role: input.role },
      });
      invited++;
    }
    return { invited, skipped };
  });
}

export async function changeMemberRole(ctx: WorkspaceCtx, raw: unknown) {
  assertAdmin(ctx);
  const { memberId, role } = ChangeRoleSchema.parse(raw);
  return withMutation(ctx, async ({ tx, activity, emit }) => {
    const member = await tx.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ctx.workspace.id },
      select: { id: true, role: true, userId: true },
    });
    if (!member) throw new NotFoundError();
    if ((role === "OWNER" || member.role === "OWNER") && ctx.role !== "OWNER")
      throw new ForbiddenError();
    if (member.role === "OWNER" && role !== "OWNER") {
      const owners = await tx.workspaceMember.count({
        where: { workspaceId: ctx.workspace.id, role: "OWNER", status: "ACTIVE" },
      });
      if (owners <= 1) throw new ConflictError("last_owner");
    }
    await tx.workspaceMember.update({ where: { id: member.id }, data: { role } });
    await audit(tx, ctx, {
      action: "member.role_changed",
      targetType: "WorkspaceMember",
      targetId: member.id,
      metadata: { from: member.role, to: role },
    });
    activity({
      entityType: "MEMBER",
      entityId: member.userId,
      verb: "updated",
      field: "role",
      fromValue: member.role,
      toValue: role,
    });
    emit({
      topic: `workspace:${ctx.workspace.id}`,
      type: "member.updated",
      payload: { userId: member.userId },
    });
  });
}

/** Admins let a member approve (or stop approving) the AI teammate's actions. */
export async function setCanApproveAgentActions(ctx: WorkspaceCtx, raw: unknown) {
  assertAdmin(ctx);
  const { memberId, canApprove } = SetApproverSchema.parse(raw);
  return withMutation(ctx, async ({ tx, emit }) => {
    const member = await tx.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ctx.workspace.id, user: { kind: "HUMAN" } },
      select: { id: true, role: true, userId: true },
    });
    if (!member) throw new NotFoundError();
    if (member.role === "GUEST") throw new ConflictError("guest_cannot_approve");
    await tx.workspaceMember.update({
      where: { id: member.id },
      data: { canApproveAgentActions: canApprove },
    });
    await audit(tx, ctx, {
      action: canApprove ? "member.agent_approver_added" : "member.agent_approver_removed",
      targetType: "WorkspaceMember",
      targetId: member.id,
    });
    emit({
      topic: `workspace:${ctx.workspace.id}`,
      type: "member.updated",
      payload: { userId: member.userId },
    });
  });
}

export async function setMemberActive(ctx: WorkspaceCtx, memberId: string, active: boolean) {
  assertAdmin(ctx);
  return withMutation(ctx, async ({ tx, activity }) => {
    const member = await tx.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ctx.workspace.id },
      select: { id: true, role: true, userId: true },
    });
    if (!member) throw new NotFoundError();
    if (member.userId === ctx.actor.userId) throw new ConflictError("self");
    if (member.role === "OWNER" && ctx.role !== "OWNER") throw new ForbiddenError();
    await tx.workspaceMember.update({
      where: { id: member.id },
      data: active
        ? { status: "ACTIVE", deactivatedAt: null }
        : { status: "DEACTIVATED", deactivatedAt: new Date() },
    });
    if (!active) await tx.session.deleteMany({ where: { userId: member.userId } });
    await audit(tx, ctx, {
      action: active ? "member.reactivated" : "member.deactivated",
      targetType: "WorkspaceMember",
      targetId: member.id,
    });
    activity({
      entityType: "MEMBER",
      entityId: member.userId,
      verb: active ? "reactivated" : "deactivated",
    });
  });
}

export async function revokeInvite(ctx: WorkspaceCtx, inviteId: string) {
  assertAdmin(ctx);
  return withMutation(ctx, async ({ tx }) => {
    const invite = await tx.workspaceInvite.findFirst({
      where: { id: inviteId, workspaceId: ctx.workspace.id, acceptedAt: null },
    });
    if (!invite) throw new NotFoundError();
    await tx.workspaceInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    const user = await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } });
    if (user) {
      await tx.workspaceMember.updateMany({
        where: { workspaceId: ctx.workspace.id, userId: user.id, status: "INVITED" },
        data: { status: "DEACTIVATED", deactivatedAt: new Date() },
      });
    }
    await audit(tx, ctx, {
      action: "member.invite_revoked",
      targetType: "WorkspaceInvite",
      targetId: invite.id,
      metadata: { email: invite.email },
    });
  });
}

export async function resendInvite(ctx: WorkspaceCtx, inviteId: string) {
  assertAdmin(ctx);
  return withMutation(ctx, async ({ tx }) => {
    const invite = await tx.workspaceInvite.findFirst({
      where: { id: inviteId, workspaceId: ctx.workspace.id, acceptedAt: null },
    });
    if (!invite) throw new NotFoundError();
    await tx.workspaceInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    const next = await issueInvite(tx, ctx, {
      email: invite.email,
      role: invite.role,
      projectIds: invite.projectIds,
    });
    await audit(tx, ctx, {
      action: "member.invite_resent",
      targetType: "WorkspaceInvite",
      targetId: next.id,
      metadata: { email: invite.email },
    });
  });
}
