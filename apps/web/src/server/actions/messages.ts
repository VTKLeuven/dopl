"use server";

import { z } from "zod";
import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  addChannelMembers,
  createChannel,
  hideDm,
  joinChannel,
  leaveChannel,
  markChannelRead,
  openDm,
  removeChannelMember,
  setChannelArchived,
  updateChannel,
} from "../services/channels";
import {
  createItemFromMessage,
  editMessage,
  markThreadRead,
  sendMessage,
  setMessageDeleted,
  setThreadFollow,
  toggleMessageReaction,
} from "../services/messages";

const Id = z.uuid();

export async function createChannelAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createChannel(ctx, input));
}
export async function updateChannelAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => updateChannel(ctx, input));
}
export async function setChannelArchivedAction(ws: string, id: string, archived: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setChannelArchived(ctx, Id.parse(id), archived === true));
}
export async function joinChannelAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => joinChannel(ctx, Id.parse(id)));
}
export async function leaveChannelAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => leaveChannel(ctx, Id.parse(id)));
}
export async function addChannelMembersAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => addChannelMembers(ctx, input));
}
export async function removeChannelMemberAction(ws: string, channelId: string, userId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => removeChannelMember(ctx, Id.parse(channelId), Id.parse(userId)));
}
export async function openDmAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => openDm(ctx, input));
}
export async function hideDmAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => hideDm(ctx, Id.parse(id)));
}
export async function markChannelReadAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => markChannelRead(ctx, input));
}
export async function sendMessageAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => sendMessage(ctx, input));
}
export async function editMessageAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => editMessage(ctx, input));
}
export async function setMessageDeletedAction(ws: string, id: string, deleted: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setMessageDeleted(ctx, Id.parse(id), deleted === true));
}
export async function toggleMessageReactionAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => toggleMessageReaction(ctx, input));
}
export async function setThreadFollowAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setThreadFollow(ctx, input));
}
export async function markThreadReadAction(ws: string, rootId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => markThreadRead(ctx, Id.parse(rootId)));
}
export async function createItemFromMessageAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createItemFromMessage(ctx, input));
}
