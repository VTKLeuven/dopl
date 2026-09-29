import type { Prisma, TransactionClient } from "@dopl/db";
import { notify } from "@dopl/server/notify";
import { textToDoc } from "@dopl/shared/rich-text";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { emitRealtime } from "../realtime";

export interface ReplyRun {
  id: string;
  workspaceId: string;
  agentUserId: string;
  triggeredById: string | null;
  trigger: string;
  workItemId: string | null;
  channelId: string | null;
  triggerMessageId: string | null;
}

/**
 * Posts the agent's final answer where it was asked (ARCHITECTURE §8.3): a
 * comment on the work item, or a message in the DM / the mention's thread.
 * Runs in the worker's transaction with the same outbox and notifications
 * as the web's services.
 */
export async function postAgentReply(tx: TransactionClient, run: ReplyRun, text: string) {
  const body = textToDoc(text) as unknown as Prisma.InputJsonValue;
  const bodyText = text.slice(0, 20_000);
  const emit = (e: { topic: string; type: string; payload: Prisma.InputJsonValue }) =>
    emitRealtime(tx, { workspaceId: run.workspaceId, ...e });
  const notifyCtx = { tx, workspaceId: run.workspaceId, actor: { userId: run.agentUserId }, emit };

  if (run.workItemId) {
    const item = await tx.workItem.findUnique({
      where: { id: run.workItemId },
      select: {
        id: true,
        projectId: true,
        title: true,
        sequence: true,
        deletedAt: true,
        project: { select: { identifier: true } },
      },
    });
    if (!item || item.deletedAt) return;
    const comment = await tx.comment.create({
      data: {
        workspaceId: run.workspaceId,
        projectId: item.projectId,
        workItemId: item.id,
        authorId: run.agentUserId,
        agentRunId: run.id,
        visibility: "INTERNAL",
        body,
        bodyText,
      },
      select: { id: true },
    });
    await tx.workItem.update({
      where: { id: item.id },
      data: { commentCount: { increment: 1 } },
    });
    await tx.activity.create({
      data: {
        workspaceId: run.workspaceId,
        projectId: item.projectId,
        workItemId: item.id,
        entityType: "WORK_ITEM",
        entityId: item.id,
        verb: "commented",
        meta: { commentId: comment.id },
        actorType: "AGENT",
        actorId: run.agentUserId,
        agentRunId: run.id,
      },
    });
    await emit({ topic: `workItem:${item.id}`, type: "comment.created", payload: { id: comment.id } });
    await emit({
      topic: `project:${item.projectId}`,
      type: "workItem.updated",
      payload: { id: item.id, fields: ["commentCount"] },
    });
    if (run.triggeredById)
      await notify(notifyCtx, {
        recipientIds: [run.triggeredById],
        type: "AGENT_RUN_FINISHED",
        entityType: "AGENT_RUN",
        entityId: run.id,
        workItemId: item.id,
        projectId: item.projectId,
        data: {
          identifier: formatIdentifier(item.project.identifier, item.sequence),
          title: item.title,
          excerpt: bodyText.slice(0, 200),
          runId: run.id,
        },
      });
    return;
  }

  if (run.channelId) {
    const trigger = run.triggerMessageId
      ? await tx.message.findUnique({
          where: { id: run.triggerMessageId },
          select: { id: true, threadRootId: true },
        })
      : null;
    // A mention in a channel is answered in its thread; a DM in place.
    const rootId =
      trigger?.threadRootId ?? (run.trigger === "MESSAGE_MENTION" ? (trigger?.id ?? null) : null);
    const channel = await tx.channel.findUnique({
      where: { id: run.channelId },
      select: {
        id: true,
        kind: true,
        name: true,
        projectId: true,
        archivedAt: true,
        project: { select: { name: true } },
      },
    });
    if (!channel || channel.archivedAt) return;
    const message = await tx.message.create({
      data: {
        workspaceId: run.workspaceId,
        channelId: channel.id,
        authorId: run.agentUserId,
        kind: "AGENT",
        agentRunId: run.id,
        threadRootId: rootId,
        body,
        bodyText,
      },
      select: { id: true, createdAt: true },
    });
    await tx.channel.update({
      where: { id: channel.id },
      data: { lastMessageAt: message.createdAt },
    });
    if (rootId) {
      await tx.message.update({
        where: { id: rootId },
        data: { replyCount: { increment: 1 }, lastReplyAt: message.createdAt },
      });
      if (run.triggeredById)
        await tx.threadFollower.upsert({
          where: { messageId_userId: { messageId: rootId, userId: run.triggeredById } },
          create: { messageId: rootId, userId: run.triggeredById },
          update: {},
        });
    }
    if (channel.kind === "DM" || channel.kind === "GROUP_DM") {
      const hidden = await tx.channelMember.findMany({
        where: { channelId: channel.id, hiddenAt: { not: null } },
        select: { userId: true },
      });
      if (hidden.length) {
        await tx.channelMember.updateMany({
          where: { channelId: channel.id, hiddenAt: { not: null } },
          data: { hiddenAt: null },
        });
        for (const h of hidden)
          await emit({ topic: `user:${h.userId}`, type: "channel.joined", payload: { channelId: channel.id } });
      }
    }
    await emit({
      topic: `channel:${channel.id}`,
      type: "message.created",
      payload: {
        id: message.id,
        channelId: channel.id,
        threadRootId: rootId,
        authorId: run.agentUserId,
      },
    });
    if (rootId && run.triggeredById)
      await notify(notifyCtx, {
        recipientIds: [run.triggeredById],
        type: "THREAD_REPLY",
        entityType: "MESSAGE",
        entityId: message.id,
        messageId: message.id,
        projectId: channel.projectId,
        groupKey: `thread:${rootId}`,
        data: {
          channelId: channel.id,
          channelKind: channel.kind,
          channelName:
            channel.kind === "PROJECT"
              ? (channel.project?.name ?? channel.name)
              : channel.kind === "CUSTOM"
                ? channel.name
                : null,
          threadRootId: rootId,
          excerpt: bodyText.slice(0, 200),
        },
      });
  }
}
