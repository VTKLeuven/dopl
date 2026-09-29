import "server-only";
import type { Prisma } from "@dopl/db";
import { canEditComment, ForbiddenError } from "@dopl/shared/policy";
import { CommentSchema, EditCommentSchema, ReactionSchema } from "@dopl/shared/schemas/work-item";
import { docToPlainText, extractMentions, isEmptyDoc, sanitizeDoc } from "@dopl/shared/rich-text";
import { ConflictError, NotFoundError } from "../action-result";
import { db } from "../db";
import { withMutation } from "../mutation";
import { projectAccessById } from "../queries/projects";
import type { WorkspaceCtx } from "../session";

export async function createComment(ctx: WorkspaceCtx, raw: unknown) {
  const input = CommentSchema.parse(raw);
  const body = sanitizeDoc(input.body);
  if (isEmptyDoc(body)) throw new ConflictError("empty_comment");
  return withMutation(ctx, async (m) => {
    const item = await m.tx.workItem.findFirst({
      where: { id: input.workItemId, workspaceId: ctx.workspace.id, deletedAt: null },
      select: { id: true, projectId: true, title: true, sequence: true },
    });
    if (!item) throw new NotFoundError();
    const access = await projectAccessById(ctx, item.projectId);
    if (!access.can("comment.create")) throw new ForbiddenError();

    const comment = await m.tx.comment.create({
      data: {
        workspaceId: ctx.workspace.id,
        projectId: item.projectId,
        workItemId: item.id,
        authorId: ctx.actor.userId,
        visibility: input.visibility,
        body: body as unknown as Prisma.InputJsonValue,
        bodyText: docToPlainText(body),
      },
      select: { id: true, createdAt: true },
    });
    await m.tx.workItem.update({
      where: { id: item.id },
      data: { commentCount: { increment: 1 } },
    });

    const mentioned = extractMentions(body);
    for (const userId of [ctx.actor.userId, ...mentioned]) {
      await m.tx.workItemSubscriber.upsert({
        where: { workItemId_userId: { workItemId: item.id, userId } },
        create: {
          workItemId: item.id,
          userId,
          workspaceId: ctx.workspace.id,
          reason: userId === ctx.actor.userId ? "COMMENTER" : "MENTIONED",
        },
        update: {},
      });
    }
    const identifier = `${access.project.identifier}-${item.sequence ?? ""}`;
    const excerpt = docToPlainText(body, 200);
    const subscribers = await m.tx.workItemSubscriber.findMany({
      where: {
        workItemId: item.id,
        muted: false,
        userId: { notIn: [ctx.actor.userId, ...mentioned] },
      },
      select: { userId: true },
    });
    const notifications = [
      ...mentioned
        .filter((u) => u !== ctx.actor.userId)
        .map((recipientId) => ({ recipientId, type: "MENTION" as const })),
      ...subscribers.map((s) => ({ recipientId: s.userId, type: "COMMENT" as const })),
    ];
    if (notifications.length) {
      await m.tx.notification.createMany({
        data: notifications.map((n) => ({
          workspaceId: ctx.workspace.id,
          recipientId: n.recipientId,
          actorId: ctx.actor.userId,
          type: n.type,
          entityType: "COMMENT",
          entityId: comment.id,
          workItemId: item.id,
          projectId: item.projectId,
          groupKey: `workItem:${item.id}:${n.type}`,
          data: { identifier, title: item.title, excerpt },
        })),
      });
    }
    m.activity({
      entityType: "WORK_ITEM",
      entityId: item.id,
      workItemId: item.id,
      projectId: item.projectId,
      verb: "commented",
      meta: { commentId: comment.id },
    });
    m.emit({ topic: `workItem:${item.id}`, type: "comment.created", payload: { id: comment.id } });
    m.emit({
      topic: `project:${item.projectId}`,
      type: "workItem.updated",
      payload: { id: item.id, fields: ["commentCount"] },
    });
    return comment;
  });
}

async function loadComment(ctx: WorkspaceCtx, id: string) {
  const comment = await db.comment.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null },
    select: { id: true, authorId: true, workItemId: true, projectId: true },
  });
  if (!comment) throw new NotFoundError();
  const access = await projectAccessById(ctx, comment.projectId);
  return { comment, access };
}

export async function editComment(ctx: WorkspaceCtx, raw: unknown) {
  const input = EditCommentSchema.parse(raw);
  const body = sanitizeDoc(input.body);
  if (isEmptyDoc(body)) throw new ConflictError("empty_comment");
  const { comment, access } = await loadComment(ctx, input.id);
  if (!canEditComment(ctx.policyActor, access.policy, comment)) throw new ForbiddenError();
  return withMutation(ctx, async (m) => {
    await m.tx.comment.update({
      where: { id: comment.id },
      data: {
        body: body as unknown as Prisma.InputJsonValue,
        bodyText: docToPlainText(body),
        editedAt: new Date(),
      },
    });
    m.emit({
      topic: `workItem:${comment.workItemId}`,
      type: "comment.updated",
      payload: { id: comment.id },
    });
    return { id: comment.id };
  });
}

export async function setCommentDeleted(ctx: WorkspaceCtx, id: string, deleted: boolean) {
  const comment = await db.comment.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: { id: true, authorId: true, workItemId: true, projectId: true, deletedAt: true },
  });
  if (!comment) throw new NotFoundError();
  const access = await projectAccessById(ctx, comment.projectId);
  if (!canEditComment(ctx.policyActor, access.policy, comment)) throw new ForbiddenError();
  if (Boolean(comment.deletedAt) === deleted) return { id };
  return withMutation(ctx, async (m) => {
    await m.tx.comment.update({ where: { id }, data: { deletedAt: deleted ? new Date() : null } });
    await m.tx.workItem.update({
      where: { id: comment.workItemId },
      data: { commentCount: { increment: deleted ? -1 : 1 } },
    });
    m.emit({
      topic: `workItem:${comment.workItemId}`,
      type: deleted ? "comment.deleted" : "comment.created",
      payload: { id },
    });
    return { id };
  });
}

export async function toggleReaction(ctx: WorkspaceCtx, raw: unknown) {
  const input = ReactionSchema.parse(raw);
  const { comment, access } = await loadComment(ctx, input.commentId);
  if (!access.can("project.view")) throw new ForbiddenError();
  return withMutation(ctx, async (m) => {
    const existing = await m.tx.reaction.findFirst({
      where: { userId: ctx.actor.userId, emoji: input.emoji, commentId: comment.id },
    });
    if (existing) await m.tx.reaction.delete({ where: { id: existing.id } });
    else
      await m.tx.reaction.create({
        data: {
          workspaceId: ctx.workspace.id,
          userId: ctx.actor.userId,
          emoji: input.emoji,
          commentId: comment.id,
        },
      });
    m.emit({
      topic: `workItem:${comment.workItemId}`,
      type: "comment.updated",
      payload: { id: comment.id },
    });
    return { reacted: !existing };
  });
}
