"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import {
  checkAgentConnection,
  createAgent,
  createMcpToken,
  decideApproval,
  deleteAgentHost,
  deleteCommandRule,
  markItemReviewed,
  revokeMcpToken,
  setAgentApprovalsSkipped,
  setAgentPaused,
  setAgentStatus,
  stopAgentRun,
  testCommand,
  updateAgentProfile,
  upsertAgentHost,
  upsertCommandRule,
} from "../services/agent";

export async function createAgentAction(ws: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createAgent(ctx));
}
export async function updateAgentProfileAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => updateAgentProfile(ctx, input));
}
export async function setAgentStatusAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setAgentStatus(ctx, input));
}
export async function setAgentPausedAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setAgentPaused(ctx, input));
}
export async function setAgentApprovalsSkippedAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => setAgentApprovalsSkipped(ctx, input));
}
export async function checkAgentConnectionAction(ws: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => checkAgentConnection(ctx));
}
export async function upsertAgentHostAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => upsertAgentHost(ctx, input));
}
export async function deleteAgentHostAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => deleteAgentHost(ctx, id));
}
export async function upsertCommandRuleAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => upsertCommandRule(ctx, input));
}
export async function deleteCommandRuleAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => deleteCommandRule(ctx, id));
}
export async function testCommandAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => testCommand(ctx, input));
}
export async function createMcpTokenAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => createMcpToken(ctx, input));
}
export async function revokeMcpTokenAction(ws: string, id: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => revokeMcpToken(ctx, id));
}
export async function decideApprovalAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => decideApproval(ctx, input));
}
export async function stopAgentRunAction(ws: string, input: unknown) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => stopAgentRun(ctx, input));
}
export async function markItemReviewedAction(ws: string, workItemId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => markItemReviewed(ctx, workItemId));
}
