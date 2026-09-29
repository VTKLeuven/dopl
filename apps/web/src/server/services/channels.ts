import "server-only";
import { ForbiddenError } from "@dopl/shared/policy";
import {
  ChannelMembersSchema,
  CreateChannelSchema,
  MarkChannelReadSchema,
  OpenDmSchema,
  UpdateChannelSchema,
  channelSlug,
  dmKey,
} from "@dopl/shared/schemas/messages";
import { ConflictError, NotFoundError } from "../action-result";
import { db } from "../db";
import { withMutation, type Mutation } from "../mutation";
import { channelAccessById, type ChannelAccess } from "../queries/channels";
import type { WorkspaceCtx } from "../session";
import { readNotificationsWhere } from "./inbox";

/*
 * Channels (Phase 4). Project channels are created with their project and
 * need no membership rows: a row appears lazily the first time someone
 * reads or posts, to hold `lastReadAt`. Custom channels and DMs always
 * have rows. Guests never take part (canChannel).
 */

function assertChat(ctx: WorkspaceCtx) {
  if (ctx.role === "GUEST") throw new ForbiddenError();
}

/** Active, non-guest members of this workspace among `ids` (and not SYSTEM users). */
async function chatMembers(m: Mutation, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await m.tx.workspaceMember.findMany({
    where: {
      workspaceId: m.ctx.workspace.id,
      userId: { in: [...new Set(ids)] },
      status: "ACTIVE",
      role: { not: "GUEST" },
      user: { kind: { not: "SYSTEM" } },
    },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

function emitMembers(m: Mutation, channelId: string, added: string[], removed: string[]) {
  m.emit({
    topic: `channel:${channelId}`,
    type: "channel.membersChanged",
    payload: { id: channelId, added, removed },
  });
  for (const userId of added)
    m.emit({ topic: `user:${userId}`, type: "channel.joined", payload: { channelId } });
  for (const userId of removed)
    m.emit({ topic: `user:${userId}`, type: "channel.left", payload: { channelId } });
}

async function uniqueSlug(m: Mutation, name: string): Promise<string> {
  const base = channelSlug(name) || "channel";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await m.tx.channel.findFirst({
      where: { workspaceId: m.ctx.workspace.id, slug },
      select: { id: true },
    });
    if (!taken) return slug;
  }
  throw new ConflictError("slug_taken");
}

export async function createChannel(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = CreateChannelSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const slug = await uniqueSlug(m, input.name);
    const channel = await m.tx.channel.create({
      data: {
        workspaceId: ctx.workspace.id,
        kind: "CUSTOM",
        name: input.name,
        slug,
        description: input.description || null,
        isPrivate: input.isPrivate,
        createdById: ctx.actor.userId,
      },
      select: { id: true, name: true, slug: true },
    });
    const others = (await chatMembers(m, input.memberIds)).filter((u) => u !== ctx.actor.userId);
    await m.tx.channelMember.createMany({
      data: [
        { userId: ctx.actor.userId, role: "OWNER" as const, lastReadAt: new Date() },
        ...others.map((userId) => ({ userId, role: "MEMBER" as const, lastReadAt: null })),
      ].map((r) => ({ ...r, channelId: channel.id, workspaceId: ctx.workspace.id })),
    });
    m.activity({
      entityType: "CHANNEL",
      entityId: channel.id,
      verb: "created",
      meta: { name: channel.name, isPrivate: input.isPrivate, members: others.length + 1 },
    });
    emitMembers(m, channel.id, [ctx.actor.userId, ...others], []);
    return channel;
  });
}

async function loadForWrite(ctx: WorkspaceCtx, m: Mutation, channelId: string) {
  return channelAccessById(ctx, channelId, m.tx);
}

export async function updateChannel(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = UpdateChannelSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const access = await loadForWrite(ctx, m, input.id);
    if (!access.can("channel.manage")) throw new ForbiddenError();
    const c = access.channel;
    const data: {
      name?: string;
      slug?: string;
      topic?: string | null;
      description?: string | null;
    } = {};
    if (input.name !== undefined && c.kind === "CUSTOM" && input.name !== c.name) {
      data.name = input.name;
      data.slug = await uniqueSlug(m, input.name);
    }
    if (input.topic !== undefined) data.topic = input.topic || null;
    if (input.description !== undefined) data.description = input.description || null;
    if (Object.keys(data).length === 0) return { id: c.id };
    await m.tx.channel.update({ where: { id: c.id }, data });
    m.activity({
      entityType: "CHANNEL",
      entityId: c.id,
      projectId: c.projectId,
      verb: "updated",
      meta: { fields: Object.keys(data), name: data.name ?? c.name },
    });
    m.emit({ topic: `channel:${c.id}`, type: "channel.updated", payload: { id: c.id } });
    return { id: c.id };
  });
}

export async function setChannelArchived(ctx: WorkspaceCtx, channelId: string, archived: boolean) {
  assertChat(ctx);
  return withMutation(ctx, async (m) => {
    const access = await loadForWrite(ctx, m, channelId);
    if (access.channel.kind !== "CUSTOM" || !access.can("channel.manage"))
      throw new ForbiddenError();
    await m.tx.channel.update({
      where: { id: channelId },
      data: { archivedAt: archived ? new Date() : null },
    });
    m.activity({
      entityType: "CHANNEL",
      entityId: channelId,
      verb: archived ? "archived" : "unarchived",
    });
    m.emit({ topic: `channel:${channelId}`, type: "channel.archived", payload: { id: channelId } });
    return { id: channelId };
  });
}

export async function joinChannel(ctx: WorkspaceCtx, channelId: string) {
  assertChat(ctx);
  return withMutation(ctx, async (m) => {
    const access = await loadForWrite(ctx, m, channelId);
    if (!access.can("channel.join")) throw new ForbiddenError();
    await ensureMember(m, access, { lastReadAt: new Date() });
    return { id: channelId };
  });
}

/**
 * The membership row the reader needs: created on first read/post in a
 * project channel, or when joining (or posting in) a public channel.
 */
export async function ensureMember(
  m: Mutation,
  access: ChannelAccess,
  opts: { lastReadAt?: Date | null } = {},
): Promise<void> {
  const c = access.channel;
  const userId = m.ctx.actor.userId;
  if (access.policy.memberRole) {
    await m.tx.channelMember.updateMany({
      where: { channelId: c.id, userId, hiddenAt: { not: null } },
      data: { hiddenAt: null },
    });
    return;
  }
  await m.tx.channelMember.upsert({
    where: { channelId_userId: { channelId: c.id, userId } },
    create: {
      channelId: c.id,
      userId,
      workspaceId: c.workspaceId,
      role: "MEMBER",
      lastReadAt: opts.lastReadAt ?? null,
    },
    update: {},
  });
  // Joining a custom channel is a membership change others see.
  if (c.kind === "CUSTOM") {
    m.activity({ entityType: "CHANNEL", entityId: c.id, verb: "joined" });
    emitMembers(m, c.id, [userId], []);
  }
}

export async function leaveChannel(ctx: WorkspaceCtx, channelId: string) {
  assertChat(ctx);
  return withMutation(ctx, async (m) => {
    const access = await loadForWrite(ctx, m, channelId);
    if (!access.can("channel.leave")) throw new ForbiddenError();
    await m.tx.channelMember.delete({
      where: { channelId_userId: { channelId, userId: ctx.actor.userId } },
    });
    m.activity({ entityType: "CHANNEL", entityId: channelId, verb: "left" });
    emitMembers(m, channelId, [], [ctx.actor.userId]);
    return { id: channelId };
  });
}

export async function addChannelMembers(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = ChannelMembersSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const access = await loadForWrite(ctx, m, input.channelId);
    if (!access.can("channel.members")) throw new ForbiddenError();
    const valid = await chatMembers(m, input.userIds);
    const existing = await m.tx.channelMember.findMany({
      where: { channelId: input.channelId, userId: { in: valid } },
      select: { userId: true },
    });
    const have = new Set(existing.map((e) => e.userId));
    const added = valid.filter((u) => !have.has(u));
    if (added.length === 0) return { added: 0 };
    await m.tx.channelMember.createMany({
      data: added.map((userId) => ({
        channelId: input.channelId,
        userId,
        workspaceId: ctx.workspace.id,
        role: "MEMBER" as const,
      })),
    });
    m.activity({
      entityType: "CHANNEL",
      entityId: input.channelId,
      verb: "membersAdded",
      meta: { userIds: added },
    });
    emitMembers(m, input.channelId, added, []);
    return { added: added.length };
  });
}

export async function removeChannelMember(ctx: WorkspaceCtx, channelId: string, userId: string) {
  assertChat(ctx);
  if (userId === ctx.actor.userId) return leaveChannel(ctx, channelId);
  return withMutation(ctx, async (m) => {
    const access = await loadForWrite(ctx, m, channelId);
    if (access.channel.kind !== "CUSTOM" || !access.can("channel.manage"))
      throw new ForbiddenError();
    const res = await m.tx.channelMember.deleteMany({ where: { channelId, userId } });
    if (res.count === 0) throw new NotFoundError();
    m.activity({
      entityType: "CHANNEL",
      entityId: channelId,
      verb: "memberRemoved",
      meta: { userId },
    });
    emitMembers(m, channelId, [], [userId]);
    return { id: channelId };
  });
}

/** Finds or creates the DM (1 other person) or group DM (2–8) with these people. */
export async function openDm(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = OpenDmSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const others = (await chatMembers(m, input.userIds)).filter((u) => u !== ctx.actor.userId);
    if (others.length === 0) throw new ConflictError("no_participants");
    const participants = [ctx.actor.userId, ...others];
    const key = `${ctx.workspace.id}:${dmKey(participants)}`;
    const existing = await m.tx.channel.findUnique({ where: { dmKey: key }, select: { id: true } });
    if (existing) {
      await m.tx.channelMember.updateMany({
        where: { channelId: existing.id, userId: ctx.actor.userId },
        data: { hiddenAt: null },
      });
      m.emit({
        topic: `user:${ctx.actor.userId}`,
        type: "channel.joined",
        payload: { channelId: existing.id },
      });
      return { id: existing.id, created: false };
    }
    const channel = await m.tx.channel.create({
      data: {
        workspaceId: ctx.workspace.id,
        kind: others.length === 1 ? "DM" : "GROUP_DM",
        dmKey: key,
        isPrivate: true,
        createdById: ctx.actor.userId,
      },
      select: { id: true },
    });
    await m.tx.channelMember.createMany({
      data: participants.map((userId) => ({
        channelId: channel.id,
        userId,
        workspaceId: ctx.workspace.id,
        role: "MEMBER" as const,
        lastReadAt: userId === ctx.actor.userId ? new Date() : null,
      })),
    });
    m.activity({
      entityType: "CHANNEL",
      entityId: channel.id,
      verb: "created",
      meta: { kind: others.length === 1 ? "DM" : "GROUP_DM" },
    });
    // Only the opener sees it until the first message arrives.
    m.emit({
      topic: `user:${ctx.actor.userId}`,
      type: "channel.joined",
      payload: { channelId: channel.id },
    });
    return { id: channel.id, created: true };
  });
}

/** Closes a DM from the sidebar; the next message reopens it. */
export async function hideDm(ctx: WorkspaceCtx, channelId: string) {
  assertChat(ctx);
  return withMutation(ctx, async (m) => {
    const access = await loadForWrite(ctx, m, channelId);
    if (access.channel.kind !== "DM" && access.channel.kind !== "GROUP_DM")
      throw new ForbiddenError();
    await m.tx.channelMember.updateMany({
      where: { channelId, userId: ctx.actor.userId },
      data: { hiddenAt: new Date() },
    });
    m.emit({ topic: `user:${ctx.actor.userId}`, type: "channel.hidden", payload: { channelId } });
    return { id: channelId };
  });
}

/**
 * Moves the reader's `lastReadAt` forward (never back) to the newest message
 * they have seen, and reads the mention notifications of those messages.
 * Other tabs of the same person follow through `channel.read`.
 */
export async function markChannelRead(ctx: WorkspaceCtx, raw: unknown) {
  assertChat(ctx);
  const input = MarkChannelReadSchema.parse(raw);
  const at = input.at ? new Date(input.at) : new Date();
  // Clamp to now: a reader can't have seen the future.
  const readAt = at.getTime() > Date.now() ? new Date() : at;
  const access = await channelAccessById(ctx, input.channelId);
  const current = access.channel.members[0]?.lastReadAt;
  if (current && current >= readAt) return { lastReadAt: current.toISOString(), changed: false };
  return withMutation(ctx, async (m) => {
    await m.tx.channelMember.upsert({
      where: { channelId_userId: { channelId: input.channelId, userId: ctx.actor.userId } },
      create: {
        channelId: input.channelId,
        userId: ctx.actor.userId,
        workspaceId: ctx.workspace.id,
        role: "MEMBER",
        lastReadAt: readAt,
      },
      update: {},
    });
    // A concurrent read (another tab) may already have gone further: keep
    // the later time. GREATEST ignores NULL.
    await m.tx.$executeRaw`
      UPDATE channel_members SET "lastReadAt" = GREATEST("lastReadAt", ${readAt})
      WHERE "channelId" = ${input.channelId}::uuid AND "userId" = ${ctx.actor.userId}::uuid`;
    await readNotificationsWhere(m, ctx.actor.userId, {
      type: "MENTION",
      messageId: { not: null },
      data: { path: ["channelId"], equals: input.channelId },
      createdAt: { lte: readAt },
    });
    m.emit({
      topic: `user:${ctx.actor.userId}`,
      type: "channel.read",
      payload: { channelId: input.channelId, at: readAt.toISOString() },
    });
    return { lastReadAt: readAt.toISOString(), changed: true };
  });
}

/** Direct lookups used by pages. */
export async function firstChannelFor(ctx: WorkspaceCtx): Promise<string | null> {
  if (ctx.role === "GUEST") return null;
  const c = await db.channel.findFirst({
    where: {
      workspaceId: ctx.workspace.id,
      archivedAt: null,
      members: { some: { userId: ctx.actor.userId, hiddenAt: null } },
    },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    select: { id: true },
  });
  return c?.id ?? null;
}
