"use server";

import { refresh } from "next/cache";
import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  changeMemberRole,
  inviteMembers,
  resendInvite,
  revokeInvite,
  setMemberActive,
} from "../services/members";

export async function inviteMembersAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(() => inviteMembers(ctx, input as never));
  if (res.ok) refresh();
  return res;
}
export async function changeRoleAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(() => changeMemberRole(ctx, input));
  if (res.ok) refresh();
  return res;
}
export async function setMemberActiveAction(ws: string, memberId: string, active: boolean) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(() => setMemberActive(ctx, memberId, active));
  if (res.ok) refresh();
  return res;
}
export async function revokeInviteAction(ws: string, inviteId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(() => revokeInvite(ctx, inviteId));
  if (res.ok) refresh();
  return res;
}
export async function resendInviteAction(ws: string, inviteId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  const res = await run(() => resendInvite(ctx, inviteId));
  if (res.ok) refresh();
  return res;
}
