import "server-only";
import type { Prisma } from "@dopl/db";
import { ForbiddenError } from "@dopl/shared/policy";
import { uuidv7 } from "@dopl/shared/ids";
import {
  docToPlainText,
  docToPromptText,
  extractItemRefs,
  extractMentions,
  isEmptyDoc,
  sanitizeDoc,
  type PMNode,
} from "@dopl/shared/rich-text";
import {
  CreateItemFromMessageSchema,
  EditMessageSchema,
  MessageReactionSchema,
  SendMessageSchema,
  ThreadFollowSchema,
} from "@dopl/shared/schemas/messages";
import { CreateWorkItemSchema } from "@dopl/shared/schemas/work-item";
import { ConflictError, NotFoundError } from "../action-result";
import { agentUserIds, findAgent, queueAgentRun } from "../agent/runs";
import { withMutation, type Mutation } from "../mutation";
import { notify } from "../notifications/notify";
import { channelAccessById, usersWhoCanView, type ChannelAccess } from "../queries/channels";
import { accessibleProjectsWhere, projectAccessById } from "../queries/projects";
import { publishEphemeral } from "../realtime/ephemeral";
import type { WorkspaceCtx } from "../session";
import { blobStore, MAX_UPLOAD_BYTES } from "../storage";
import { ensureMember } from "./channels";
import { readNotificationsWhere } from "./inbox";
import { createOne } from "./work-items";

/*
 * Chat messages (Phase 4). Unread tracking lives on ChannelMember (top-level
 * messages) and ThreadFollower (replies). The Inbox gets @mentions and
 * replies in threads you follow; plain channel traffic only shows as unread
 * in the Messages sidebar.
 */

function assertChat(ctx: WorkspaceCtx) {
  if (ctx.role === "GUEST") throw new ForbiddenError();
}

/** What notification rows say about where a message was posted. */
function channelData(access: ChannelAccess, threadRootId: string | null, excerpt: string) {
  const c = access.channel;
  return {
    channelId: c.id,
    channelKind: c.kind,
    channelName:
      c.kind === "PROJECT" ? (c.project?.name ?? c.name) : c.kind === "CUSTOM" ? c.name : null,
    threadRootId,
    excerpt,
  } satisfies Prisma.InputJsonObject;
}

/** `#INFRA-42` in a message → a MENTIONED reference shown on the item's timeline. */
async function linkItemRefs(m: Mutation, messageId: string, body: PMNode) {
  const ids = extractItemRefs(body).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (ids.length === 0) return;
  const items = await m.tx.workItem.findMany({
    where: {
      id: { in: ids.slice(0, 50) },
      workspaceId: m.ctx.workspace.id,
      deletedAt: null,
      project: accessibleProjectsWhere(m.ctx),
    },
    select: { id: true },
  });
  if (items.length === 0) return;
  await m.tx.workItemReference.createMany({
    data: items.map((i) => ({
      workspaceId: m.ctx.workspace.id,
      workItemId: i.id,
      kind: "MENTIONED" as const,
      sourceType: "MESSAGE" as const,
      messageId,
      createdById: m.ctx.actor.userId,
    })),
    skipDuplicates: true,
  });
  for (const i of items)
    m.emit({ topic: `workItem:${i.id}`, type: "reference.created", payload: { id: i.id } });
}

async function notifyMentions(
  m: Mutation,
  access: ChannelAccess,
  messageId: string,
  mentioned: string[],
  data: Prisma.InputJsonObject,
): Promise<string[]> {
  const others = mentioned.filter((u) => u !== m.ctx.actor.userId);
  // Only people who can read the channel hear about it.
  const visible = await usersWhoCanView(m.tx, access.channel, others);
  const recipients = others.filter((u) => visible.has(u));
  await notify(m, {
    recipientIds: recipients,
    type: "MENTION",
    entityType: "MESSAGE",
    entityId: messageId,
    messageId,
    projectId: access.channel.projectId,
    data,
  });
  return recipients;
}

async function follow(m: Mutation, rootId: string, userIds: string[], readAt: Date | null) {
  for (const userId of new Set(userIds))
    await m.tx.threadFollower.upsert({
      where: { messageId_userId: { messageId: rootId, userId } },
      create: { messageId: rootId, userId, lastReadAt: readAt },
      update: readAt ? { lastReadAt: readAt } : {},
    });
}

export async function sendMessage(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = SendMessageSchema.parse(raw);
  const body = sanitizeDoc(input.body);
  if (isEmptyDoc(body) && input.attachmentIds.length === 0)
    throw new ConflictError("empty_message");
  const me = ctx.actor.userId;
  return withMutation(ctx, async (m) => {
    const access = await channelAccessById(ctx, input.channelId, m.tx);
    if (!access.can("channel.post")) throw new ForbiddenError();
    const c = access.channel;
    const root = input.threadRootId
      ? await m.tx.message.findFirst({
          where: { id: input.threadRootId, channelId: c.id, threadRootId: null, deletedAt: null },
          select: { id: true, authorId: true },
        })
      : null;
    if (input.threadRootId && !root) throw new NotFoundError();
    // Project channels get their row lazily; posting in a public channel joins it.
    await ensureMember(m, access);

    const message = await m.tx.message.create({
      data: {
        ...(input.clientId ? { id: input.clientId } : {}),
        workspaceId: ctx.workspace.id,
        channelId: c.id,
        authorId: me,
        kind: ctx.actor.kind === "AGENT" ? "AGENT" : "USER",
        agentRunId: ctx.agentRunId ?? null,
        threadRootId: root?.id ?? null,
        body: body as unknown as Prisma.InputJsonValue,
        bodyText: docToPlainText(body),
      },
      select: { id: true, createdAt: true },
    });

    if (input.attachmentIds.length > 0) {
      const claimed = await m.tx.attachment.updateMany({
        where: {
          id: { in: input.attachmentIds },
          workspaceId: ctx.workspace.id,
          uploadedById: me,
          status: "PENDING",
          messageId: null,
          deletedAt: null,
        },
        data: { messageId: message.id, status: "READY" },
      });
      if (claimed.count !== new Set(input.attachmentIds).size)
        throw new ConflictError("invalid_attachment");
    }

    await m.tx.channel.update({ where: { id: c.id }, data: { lastMessageAt: message.createdAt } });
    if (root) {
      await m.tx.message.update({
        where: { id: root.id },
        data: { replyCount: { increment: 1 }, lastReplyAt: message.createdAt },
      });
    } else {
      // Your own message is read.
      await m.tx.$executeRaw`
        UPDATE channel_members SET "lastReadAt" = GREATEST("lastReadAt", ${message.createdAt})
        WHERE "channelId" = ${c.id}::uuid AND "userId" = ${me}::uuid`;
    }
    // A closed DM comes back for everyone when someone writes in it.
    if (c.kind === "DM" || c.kind === "GROUP_DM") {
      const hidden = await m.tx.channelMember.findMany({
        where: { channelId: c.id, hiddenAt: { not: null } },
        select: { userId: true },
      });
      if (hidden.length) {
        await m.tx.channelMember.updateMany({
          where: { channelId: c.id, hiddenAt: { not: null } },
          data: { hiddenAt: null },
        });
        for (const h of hidden)
          m.emit({
            topic: `user:${h.userId}`,
            type: "channel.joined",
            payload: { channelId: c.id },
          });
      }
    }

    const data = channelData(access, root?.id ?? null, docToPlainText(body, 200));
    const allMentioned = extractMentions(body);
    // The AI teammate answers DMs and @mentions with a run (Phase 8).
    const agentMembers =
      c.kind === "DM"
        ? await m.tx.channelMember.findMany({
            where: { channelId: c.id, user: { kind: "AGENT" } },
            select: { userId: true },
          })
        : [];
    const agents = new Set([
      ...agentMembers.map((a) => a.userId),
      ...(await agentUserIds(m.tx, ctx.workspace.id, allMentioned)),
    ]);
    const mentioned = await notifyMentions(
      m,
      access,
      message.id,
      allMentioned.filter((u) => !agents.has(u)),
      data,
    );
    if (root) {
      // The replier, the root's author and whoever gets mentioned follow the thread.
      const followers = [me, ...mentioned, ...(root.authorId ? [root.authorId] : [])];
      const visible = await usersWhoCanView(m.tx, c, followers);
      await follow(m, root.id, [me], message.createdAt);
      await follow(
        m,
        root.id,
        followers.filter((u) => u !== me && visible.has(u)),
        null,
      );
      const audience = await m.tx.threadFollower.findMany({
        where: { messageId: root.id, userId: { notIn: [me, ...mentioned] } },
        select: { userId: true },
      });
      const canRead = await usersWhoCanView(
        m.tx,
        c,
        audience.map((a) => a.userId),
      );
      await notify(m, {
        recipientIds: [...canRead],
        type: "THREAD_REPLY",
        entityType: "MESSAGE",
        entityId: message.id,
        messageId: message.id,
        projectId: c.projectId,
        groupKey: `thread:${root.id}`,
        data,
      });
    }
    await linkItemRefs(m, message.id, body);

    m.activity({
      entityType: "MESSAGE",
      entityId: message.id,
      projectId: c.projectId,
      verb: "posted",
      meta: { channelId: c.id, threadRootId: root?.id ?? null },
    });
    m.emit({
      topic: `channel:${c.id}`,
      type: "message.created",
      payload: { id: message.id, channelId: c.id, threadRootId: root?.id ?? null, authorId: me },
    });
    if (agents.size > 0) {
      const agent = await findAgent(m.tx, ctx.workspace.id);
      if (agent && agents.has(agent.userId))
        await queueAgentRun(m, {
          agent,
          trigger: agentMembers.length > 0 ? "DIRECT_MESSAGE" : "MESSAGE_MENTION",
          request: docToPromptText(body),
          channelId: c.id,
          threadRootId: root?.id ?? null,
          triggerMessageId: message.id,
        });
    }
    return { id: message.id, createdAt: message.createdAt.toISOString() };
  });
}

async function loadMessage(m: Mutation, id: string) {
  const message = await m.tx.message.findFirst({
    where: { id, workspaceId: m.ctx.workspace.id },
    select: {
      id: true,
      channelId: true,
      authorId: true,
      threadRootId: true,
      body: true,
      deletedAt: true,
    },
  });
  if (!message) throw new NotFoundError();
  const access = await channelAccessById(m.ctx, message.channelId, m.tx);
  return { message, access };
}

export async function editMessage(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = EditMessageSchema.parse(raw);
  const body = sanitizeDoc(input.body);
  if (isEmptyDoc(body)) throw new ConflictError("empty_message");
  return withMutation(ctx, async (m) => {
    const { message, access } = await loadMessage(m, input.id);
    if (message.deletedAt) throw new NotFoundError();
    if (message.authorId !== ctx.actor.userId || !access.can("channel.post"))
      throw new ForbiddenError();
    await m.tx.message.update({
      where: { id: message.id },
      data: {
        body: body as unknown as Prisma.InputJsonValue,
        bodyText: docToPlainText(body),
        editedAt: new Date(),
      },
    });
    const before = new Set(extractMentions(message.body as PMNode | null));
    const added = extractMentions(body).filter((u) => !before.has(u));
    await notifyMentions(
      m,
      access,
      message.id,
      added,
      channelData(access, message.threadRootId, docToPlainText(body, 200)),
    );
    await linkItemRefs(m, message.id, body);
    m.activity({
      entityType: "MESSAGE",
      entityId: message.id,
      projectId: access.channel.projectId,
      verb: "edited",
    });
    m.emit({
      topic: `channel:${message.channelId}`,
      type: "message.updated",
      payload: { id: message.id, channelId: message.channelId, threadRootId: message.threadRootId },
    });
    return { id: message.id };
  });
}

/** Authors delete their own messages; channel managers moderate. Undoable. */
export async function setMessageDeleted(ctx: WorkspaceCtx, id: string, deleted: boolean) {
  assertChat(ctx);
  return withMutation(ctx, async (m) => {
    const { message, access } = await loadMessage(m, id);
    const mine = message.authorId === ctx.actor.userId;
    if (!mine && !access.can("channel.manage")) throw new ForbiddenError();
    if (Boolean(message.deletedAt) === deleted) return { id };
    await m.tx.message.update({ where: { id }, data: { deletedAt: deleted ? new Date() : null } });
    if (message.threadRootId)
      await m.tx.message.update({
        where: { id: message.threadRootId },
        data: { replyCount: { increment: deleted ? -1 : 1 } },
      });
    m.activity({
      entityType: "MESSAGE",
      entityId: id,
      projectId: access.channel.projectId,
      verb: deleted ? "deleted" : "restored",
    });
    m.emit({
      topic: `channel:${message.channelId}`,
      type: deleted ? "message.deleted" : "message.updated",
      payload: { id, channelId: message.channelId, threadRootId: message.threadRootId },
    });
    return { id };
  });
}

export async function toggleMessageReaction(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = MessageReactionSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { message, access } = await loadMessage(m, input.messageId);
    if (message.deletedAt || access.channel.archivedAt) throw new ConflictError("read_only");
    const existing = await m.tx.reaction.findFirst({
      where: { userId: ctx.actor.userId, emoji: input.emoji, messageId: message.id },
      select: { id: true },
    });
    if (existing) await m.tx.reaction.delete({ where: { id: existing.id } });
    else
      await m.tx.reaction.create({
        data: {
          workspaceId: ctx.workspace.id,
          userId: ctx.actor.userId,
          emoji: input.emoji,
          messageId: message.id,
        },
      });
    m.emit({
      topic: `channel:${message.channelId}`,
      type: "message.updated",
      payload: { id: message.id, channelId: message.channelId, threadRootId: message.threadRootId },
    });
    return { reacted: !existing };
  });
}

export async function setThreadFollow(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = ThreadFollowSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { message } = await loadMessage(m, input.rootId);
    if (message.threadRootId) throw new ConflictError("not_a_thread");
    if (input.follow) await follow(m, message.id, [ctx.actor.userId], new Date());
    else
      await m.tx.threadFollower.deleteMany({
        where: { messageId: message.id, userId: ctx.actor.userId },
      });
    m.emit({
      topic: `user:${ctx.actor.userId}`,
      type: "channel.thread",
      payload: { channelId: message.channelId, rootId: message.id },
    });
    return { following: input.follow };
  });
}

/** Opening a thread reads it: its replies and the mentions in it. */
export async function markThreadRead(ctx: WorkspaceCtx, rootId: string) {
  assertChat(ctx);
  return withMutation(ctx, async (m) => {
    const { message } = await loadMessage(m, rootId);
    const now = new Date();
    await m.tx.threadFollower.updateMany({
      where: { messageId: message.id, userId: ctx.actor.userId },
      data: { lastReadAt: now },
    });
    const read = await readNotificationsWhere(m, ctx.actor.userId, {
      OR: [
        { groupKey: `thread:${message.id}` },
        { type: "MENTION", data: { path: ["threadRootId"], equals: message.id } },
      ],
    });
    return { read };
  });
}

/**
 * "Create work item from message": the item starts with the message as its
 * description and a CREATED_FROM reference back, shown on its timeline and
 * as a chip under the message.
 */
export async function createItemFromMessage(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = CreateItemFromMessageSchema.parse(raw);
  const project = await projectAccessById(ctx, input.projectId);
  if (!project.can("workItem.create")) throw new ForbiddenError();
  return withMutation(ctx, async (m) => {
    const { message } = await loadMessage(m, input.messageId);
    if (message.deletedAt) throw new NotFoundError();
    const item = await createOne(
      m,
      project,
      CreateWorkItemSchema.parse({
        projectId: project.project.id,
        title: input.title,
        description: message.body,
        ...(input.clientId ? { clientId: input.clientId } : {}),
      }),
    );
    await m.tx.workItemReference.create({
      data: {
        workspaceId: ctx.workspace.id,
        workItemId: item.id,
        kind: "CREATED_FROM",
        sourceType: "MESSAGE",
        messageId: message.id,
        createdById: ctx.actor.userId,
      },
    });
    m.emit({ topic: `workItem:${item.id}`, type: "reference.created", payload: { id: item.id } });
    m.emit({
      topic: `channel:${message.channelId}`,
      type: "message.updated",
      payload: { id: message.id, channelId: message.channelId, threadRootId: message.threadRootId },
    });
    return { id: item.id, identifier: item.identifier, title: item.title };
  });
}

/**
 * Typing indicator: an ephemeral event on the channel topic (never stored).
 * Clients ping every few seconds while typing and expire indicators on
 * their own; `stop` clears one right away (message sent, field emptied).
 */
export async function publishTyping(
  ctx: WorkspaceCtx,
  channelId: string,
  opts: { threadRootId: string | null; stop: boolean },
) {
  assertChat(ctx);
  const access = await channelAccessById(ctx, channelId);
  if (!access.can("channel.post")) throw new ForbiddenError();
  await publishEphemeral({
    workspaceId: ctx.workspace.id,
    topic: `channel:${channelId}`,
    type: "typing",
    payload: {
      userId: ctx.actor.userId,
      name: ctx.actor.name,
      threadRootId: opts.threadRootId,
      stop: opts.stop,
    },
  });
}

const safeName = (name: string) =>
  name
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "file";

/**
 * Upload for the composer: stored as a PENDING attachment of the uploader
 * with no owner yet; sending the message claims it (sendMessage).
 */
export async function uploadMessageAttachment(ctx: WorkspaceCtx, file: File) {
  assertChat(ctx);
  if (file.size === 0) throw new ConflictError("empty_file");
  if (file.size > MAX_UPLOAD_BYTES) throw new ConflictError("too_large");
  const id = uuidv7();
  const filename = safeName(file.name);
  const key = `${ctx.workspace.id}/messages/${ctx.actor.userId}/${id}-${filename}`;
  const contentType = file.type || "application/octet-stream";
  await blobStore().put(key, Buffer.from(await file.arrayBuffer()), contentType);
  // Nothing to broadcast yet: the upload becomes visible with its message.
  return withMutation(ctx, ({ tx }) =>
    tx.attachment.create({
      data: {
        id,
        workspaceId: ctx.workspace.id,
        storageKey: key,
        filename,
        mimeType: contentType,
        size: file.size,
        status: "PENDING",
        uploadedById: ctx.actor.userId,
      },
      select: { id: true, filename: true, mimeType: true, size: true },
    }),
  );
}
