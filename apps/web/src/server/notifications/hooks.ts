import "server-only";
import type { BaseMutation } from "../mutation";
import { notify } from "./notify";

/**
 * Notification entry points for later phases, so their fan-out lands in the
 * same Inbox with the same preferences, grouping and realtime badges. The
 * Inbox already renders and links these types (Phase 4); Phase 7 (shared
 * mailbox) and Phase 8 (AI teammate) call them from their services.
 */

/** Phase 7: a shared-mailbox thread was assigned to someone. */
export function notifyEmailAssigned(
  m: BaseMutation,
  args: { recipientIds: string[]; emailThreadId: string; subject: string; from?: string },
) {
  return notify(m, {
    recipientIds: args.recipientIds,
    type: "EMAIL_ASSIGNED",
    entityType: "EMAIL_THREAD",
    entityId: args.emailThreadId,
    emailThreadId: args.emailThreadId,
    groupKey: `emailThread:${args.emailThreadId}:EMAIL_ASSIGNED`,
    data: {
      subject: args.subject,
      emailThreadId: args.emailThreadId,
      ...(args.from ? { from: args.from } : {}),
    },
  });
}

/** Phase 7: a teammate @mentioned someone in an internal email comment. */
export function notifyEmailMention(
  m: BaseMutation,
  args: { recipientIds: string[]; emailThreadId: string; subject: string; excerpt: string },
) {
  return notify(m, {
    recipientIds: args.recipientIds,
    type: "EMAIL_MENTION",
    entityType: "EMAIL_THREAD",
    entityId: args.emailThreadId,
    emailThreadId: args.emailThreadId,
    data: { subject: args.subject, emailThreadId: args.emailThreadId, excerpt: args.excerpt },
  });
}

/**
 * Phase 8: the agent wants to run a command that needs a human. Goes to
 * everyone allowed to approve (canApproveAgentAction); one row per approval.
 */
export function notifyApprovalRequested(
  m: BaseMutation,
  args: {
    recipientIds: string[];
    approvalId: string;
    runId: string;
    workItemId?: string | null;
    projectId?: string | null;
    command: string;
    host: string;
  },
) {
  return notify(m, {
    recipientIds: args.recipientIds,
    type: "AGENT_APPROVAL_REQUESTED",
    entityType: "AGENT_APPROVAL",
    entityId: args.approvalId,
    agentApprovalId: args.approvalId,
    workItemId: args.workItemId ?? null,
    projectId: args.projectId ?? null,
    groupKey: `agentApproval:${args.approvalId}`,
    data: {
      title: args.command.slice(0, 200),
      host: args.host,
      runId: args.runId,
    },
  });
}
