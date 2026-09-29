import "server-only";
import type { AgentRunTrigger, Prisma, TransactionClient } from "@dopl/db";
import { deriveRunToken, runTokenHash } from "@dopl/shared/domain/agent";
import { uuidv7 } from "@dopl/shared/ids";
import { canAskAgent } from "@dopl/shared/policy";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { enqueue } from "../jobs";
import { env } from "../env";
import type { Mutation } from "../mutation";

/** Default characters of trusted context per request (Q-18: a 128k-token model). */
export const DEFAULT_CONTEXT_BUDGET = 60_000;

export interface WorkspaceAgent {
  userId: string;
  name: string;
  profileId: string | null;
  status: "ACTIVE" | "PAUSED" | "DISABLED" | null;
  contextBudget: number;
}

/** The workspace's AI teammate (an active member with kind AGENT), if any. */
export async function findAgent(
  tx: TransactionClient,
  workspaceId: string,
): Promise<WorkspaceAgent | null> {
  const member = await tx.workspaceMember.findFirst({
    where: { workspaceId, status: "ACTIVE", user: { kind: "AGENT" } },
    orderBy: { joinedAt: "asc" },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          agentProfile: { select: { id: true, status: true, settings: true } },
        },
      },
    },
  });
  if (!member) return null;
  const p = member.user.agentProfile;
  const settings = (p?.settings ?? {}) as { contextBudgetChars?: number };
  return {
    userId: member.user.id,
    name: member.user.name,
    profileId: p?.id ?? null,
    status: p?.status ?? null,
    contextBudget: settings.contextBudgetChars ?? DEFAULT_CONTEXT_BUDGET,
  };
}

/** The ids of the workspace's agent members, for filtering mentions. */
export async function agentUserIds(tx: TransactionClient, workspaceId: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await tx.workspaceMember.findMany({
    where: { workspaceId, userId: { in: ids }, status: "ACTIVE", user: { kind: "AGENT" } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/* ───────────────────────── context (D-033) ───────────────────────── */

interface ContextPart {
  kind: string;
  id: string;
  trusted: boolean;
}

/**
 * Collects what the agent is told about a request. Only team-written text
 * goes in by default: item fields, comments by members and the agent, and
 * chat messages. Content from outside the team (intake, email, contacts,
 * guests) is left out, except the item the human explicitly asked about;
 * then it's wrapped in <untrusted> tags and the run starts tainted.
 */
class ContextBuilder {
  private sections: string[] = [];
  private used = 0;
  readonly parts: ContextPart[] = [];
  readonly reasons: string[] = [];
  skipped = 0;

  constructor(private readonly budget: number) {}

  add(text: string, part: ContextPart): boolean {
    if (this.used + text.length > this.budget) {
      this.skipped++;
      return false;
    }
    this.sections.push(text);
    this.used += text.length;
    this.parts.push(part);
    return true;
  }

  taint(reason: string) {
    if (!this.reasons.includes(reason)) this.reasons.push(reason);
  }

  toString() {
    return this.sections.join("\n\n");
  }
}

const untrustedBlock = (label: string, text: string) =>
  `<untrusted source="${label}">\n${text.replaceAll("</untrusted>", "")}\n</untrusted>`;

async function workItemContext(
  tx: TransactionClient,
  workspaceId: string,
  b: ContextBuilder,
  workItemId: string,
  opts: { includeUntrusted: boolean; excludeCommentId?: string | null },
) {
  const item = await tx.workItem.findUnique({
    where: { id: workItemId },
    select: {
      id: true,
      sequence: true,
      title: true,
      descriptionText: true,
      priority: true,
      untrusted: true,
      origin: true,
      dueDate: true,
      project: { select: { identifier: true, name: true } },
      state: { select: { name: true } },
      intakeItem: { select: { number: true } },
      assignees: { select: { user: { select: { name: true } } } },
      labels: { select: { label: { select: { name: true } } } },
    },
  });
  if (!item) return null;
  const identifier = formatIdentifier(
    item.project.identifier,
    item.sequence,
    item.intakeItem?.number,
  );
  // An untrusted item's title is outside text too (D-033).
  const title = !item.untrusted
    ? item.title
    : opts.includeUntrusted
      ? untrustedBlock(item.origin.toLowerCase(), item.title)
      : "(title written outside the team, not shown)";
  if (item.untrusted && opts.includeUntrusted) b.taint(`work_item:${identifier}`);
  const header = [
    `Work item ${identifier}: ${title}`,
    `Project: ${item.project.name} (${item.project.identifier}) · State: ${item.state.name} · Priority: ${item.priority}`,
    item.assignees.length
      ? `Assignees: ${item.assignees.map((a) => a.user.name).join(", ")}`
      : "Assignees: none",
    item.labels.length ? `Labels: ${item.labels.map((l) => l.label.name).join(", ")}` : null,
    item.dueDate ? `Due: ${item.dueDate.toISOString().slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  b.add(header, { kind: "work_item", id: item.id, trusted: true });
  if (item.descriptionText) {
    if (!item.untrusted) {
      b.add(`Description:\n${item.descriptionText}`, {
        kind: "work_item.description",
        id: item.id,
        trusted: true,
      });
    } else if (opts.includeUntrusted) {
      if (
        b.add(`Description:\n${untrustedBlock(item.origin.toLowerCase(), item.descriptionText)}`, {
          kind: "work_item.description",
          id: item.id,
          trusted: false,
        })
      )
        b.taint(`work_item:${identifier}`);
    } else b.skipped++;
  }
  // Recent comments written by the team (members and the agent). Contact
  // and guest comments are untrusted and stay out.
  const comments = await tx.comment.findMany({
    where: {
      workItemId: item.id,
      deletedAt: null,
      authorContactId: null,
      ...(opts.excludeCommentId ? { id: { not: opts.excludeCommentId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      id: true,
      bodyText: true,
      createdAt: true,
      author: {
        select: {
          name: true,
          kind: true,
          memberships: {
            where: { status: "ACTIVE", workspaceId },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  });
  const lines: string[] = [];
  for (const c of comments.reverse()) {
    const author = c.author;
    if (!author || author.memberships[0]?.role === "GUEST") {
      b.skipped++;
      continue;
    }
    lines.push(`- ${author.name} (${c.createdAt.toISOString().slice(0, 16)}): ${c.bodyText}`);
    b.parts.push({ kind: "comment", id: c.id, trusted: true });
  }
  if (lines.length)
    b.add(`Recent comments:\n${lines.join("\n")}`, {
      kind: "comments",
      id: item.id,
      trusted: true,
    });
  return { identifier, untrusted: item.untrusted };
}

async function chatContext(
  tx: TransactionClient,
  workspaceId: string,
  b: ContextBuilder,
  channelId: string,
  threadRootId: string | null,
  excludeMessageId: string | null,
) {
  const messages = await tx.message.findMany({
    where: {
      channelId,
      deletedAt: null,
      ...(threadRootId ? { OR: [{ id: threadRootId }, { threadRootId }] } : { threadRootId: null }),
      ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      bodyText: true,
      createdAt: true,
      author: {
        select: {
          name: true,
          memberships: {
            where: { status: "ACTIVE", workspaceId },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  });
  const lines: string[] = [];
  for (const msg of messages.reverse()) {
    if (!msg.author || msg.author.memberships[0]?.role === "GUEST") {
      b.skipped++;
      continue;
    }
    lines.push(
      `- ${msg.author.name} (${msg.createdAt.toISOString().slice(0, 16)}): ${msg.bodyText}`,
    );
    b.parts.push({ kind: "message", id: msg.id, trusted: true });
  }
  if (lines.length)
    b.add(`Earlier in this conversation:\n${lines.join("\n")}`, {
      kind: "chat",
      id: channelId,
      trusted: true,
    });
}

/* ───────────────────────── queueing a run ───────────────────────── */

export interface QueueRunInput {
  agent: WorkspaceAgent;
  trigger: AgentRunTrigger;
  /** What the person asked, as plain text. */
  request: string;
  workItemId?: string | null;
  channelId?: string | null;
  threadRootId?: string | null;
  triggerCommentId?: string | null;
  triggerMessageId?: string | null;
  /** The person explicitly asked about untrusted content (confirmed assignment, mention on it). */
  includeUntrusted?: boolean;
}

/**
 * Creates an AgentRun inside the caller's mutation and queues `agent.run`.
 * A paused workspace or a disabled agent still records the request, as a
 * cancelled run, so the timeline says why nothing happened.
 */
export async function queueAgentRun(m: Mutation, input: QueueRunInput) {
  const { tx, ctx } = m;
  if (!canAskAgent(ctx.policyActor)) return null;
  const workspace = await tx.workspace.findUniqueOrThrow({
    where: { id: ctx.workspace.id },
    select: { agentPausedAt: true },
  });
  const b = new ContextBuilder(input.agent.contextBudget);
  let subject: string | null = null;
  if (input.workItemId) {
    const w = await workItemContext(tx, ctx.workspace.id, b, input.workItemId, {
      includeUntrusted: input.includeUntrusted ?? false,
      excludeCommentId: input.triggerCommentId,
    });
    subject = w?.identifier ?? null;
  }
  if (input.channelId)
    await chatContext(
      tx,
      ctx.workspace.id,
      b,
      input.channelId,
      input.threadRootId ?? null,
      input.triggerMessageId ?? null,
    );

  const who = `${ctx.actor.name} <${ctx.actor.email}>`;
  const prompt = [
    `${who} asked you${subject ? ` about ${subject}` : ""}:`,
    input.request.trim() || "(no text)",
    b.toString() ? `\nContext:\n${b.toString()}` : "",
    b.skipped ? `\n(${b.skipped} item(s) of context were left out: untrusted or over budget.)` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const id = uuidv7();
  const blocked = workspace.agentPausedAt
    ? "agent_paused"
    : input.agent.status !== "ACTIVE"
      ? "agent_unavailable"
      : null;
  const run = await tx.agentRun.create({
    data: {
      id,
      workspaceId: ctx.workspace.id,
      agentUserId: input.agent.userId,
      triggeredById: ctx.actor.userId,
      trigger: input.trigger,
      status: blocked ? "CANCELLED" : "QUEUED",
      cancelReason: blocked,
      finishedAt: blocked ? new Date() : null,
      prompt,
      context: { parts: b.parts, skipped: b.skipped } as unknown as Prisma.InputJsonValue,
      untrusted: b.reasons.length > 0,
      untrustedReasons: b.reasons,
      taintedAt: b.reasons.length > 0 ? new Date() : null,
      runTokenHash: runTokenHash(deriveRunToken(env.DOPL_ENCRYPTION_KEY, id)),
      workItemId: input.workItemId ?? null,
      channelId: input.channelId ?? null,
      triggerCommentId: input.triggerCommentId ?? null,
      triggerMessageId: input.triggerMessageId ?? null,
    },
    select: { id: true, status: true },
  });
  if (!blocked) await enqueue(tx, "agent.run", { runId: run.id }, { singletonKey: run.id });
  emitRun(
    m,
    { id: run.id, workItemId: input.workItemId, channelId: input.channelId },
    "agentRun.created",
  );
  return run;
}

/** Realtime for a run: its item or channel, and the workspace's agent page. */
export function emitRun(
  m: Pick<Mutation, "emit" | "workspaceId">,
  run: { id: string; workItemId?: string | null; channelId?: string | null },
  type: string,
  extra: Record<string, Prisma.InputJsonValue> = {},
) {
  const payload = { id: run.id, ...extra };
  if (run.workItemId) m.emit({ topic: `workItem:${run.workItemId}`, type, payload });
  if (run.channelId) m.emit({ topic: `channel:${run.channelId}`, type, payload });
  m.emit({ topic: `agent:${m.workspaceId}`, type, payload });
}
