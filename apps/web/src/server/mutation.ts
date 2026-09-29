import "server-only";
import type { EntityType, Prisma, TransactionClient } from "@dopl/db";
import { uuidv7 } from "@dopl/shared/ids";
import { db } from "./db";
import type { WorkspaceCtx } from "./session";
import { queueWebhookEvents, type WebhookEventInput } from "./webhooks/dispatch";

export type { WebhookEventInput };

export interface ActivityInput {
  entityType: EntityType;
  entityId: string;
  verb: string;
  field?: string;
  fromValue?: Prisma.InputJsonValue | null;
  toValue?: Prisma.InputJsonValue | null;
  meta?: Prisma.InputJsonValue;
  projectId?: string | null;
  workItemId?: string | null;
}

export interface RealtimeInput {
  /** e.g. project:<id>, workItem:<id>, workspace:<id>, user:<id> */
  topic: string;
  type: string;
  payload: Prisma.InputJsonValue;
}

/** Who a mutation is attributed to in Activity rows. */
export interface MutationActor {
  type: "USER" | "AGENT" | "CONTACT" | "SYSTEM";
  userId: string | null;
  contactId?: string | null;
}

export interface BaseMutation {
  tx: TransactionClient;
  workspaceId: string;
  actor: MutationActor;
  batchId: string;
  activity(input: ActivityInput): void;
  emit(input: RealtimeInput): void;
  webhook(input: WebhookEventInput): void;
}

/** A mutation made by a signed-in member or guest. */
export interface Mutation extends BaseMutation {
  ctx: WorkspaceCtx;
}

async function runMutation<T>(
  workspaceId: string,
  actor: MutationActor,
  fn: (m: BaseMutation) => Promise<T>,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      const activities: ActivityInput[] = [];
      const events: RealtimeInput[] = [];
      const hooks: WebhookEventInput[] = [];
      const batchId = uuidv7();
      const result = await fn({
        tx,
        workspaceId,
        actor,
        batchId,
        activity: (a) => activities.push(a),
        emit: (e) => events.push(e),
        webhook: (w) => hooks.push(w),
      });

      if (activities.length > 0) {
        await tx.activity.createMany({
          data: activities.map((a) => ({
            workspaceId,
            projectId: a.projectId ?? null,
            workItemId: a.workItemId ?? null,
            entityType: a.entityType,
            entityId: a.entityId,
            verb: a.verb,
            field: a.field ?? null,
            fromValue: a.fromValue ?? undefined,
            toValue: a.toValue ?? undefined,
            meta: a.meta ?? {},
            actorType: actor.type,
            actorId: actor.userId,
            actorContactId: actor.contactId ?? null,
            batchId,
          })),
        });
      }
      for (const e of events) {
        const row = await tx.realtimeEvent.create({
          data: { workspaceId, topic: e.topic, type: e.type, payload: e.payload },
          select: { id: true },
        });
        await tx.$executeRaw`SELECT pg_notify('dopl_realtime', ${row.id.toString()})`;
      }
      if (hooks.length > 0) await queueWebhookEvents(tx, workspaceId, hooks);
      return result;
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
}

/**
 * Every mutation runs through here (CLAUDE.md conventions): the change,
 * its Activity rows, its realtime outbox rows and its webhook deliveries
 * commit together, and `pg_notify` fires on commit so listeners never see
 * rolled-back changes.
 */
export function withMutation<T>(ctx: WorkspaceCtx, fn: (m: Mutation) => Promise<T>): Promise<T> {
  const actor: MutationActor = {
    type: ctx.actor.kind === "AGENT" ? "AGENT" : "USER",
    userId: ctx.actor.userId,
  };
  return runMutation(ctx.workspace.id, actor, (m) => fn({ ...m, ctx }));
}

/**
 * Mutations without a signed-in member: public form submissions and status
 * page replies from contacts. Same guarantees as `withMutation`; callers do
 * their own validation and rate limiting.
 */
export function withPublicMutation<T>(
  workspaceId: string,
  actor: MutationActor,
  fn: (m: BaseMutation) => Promise<T>,
): Promise<T> {
  return runMutation(workspaceId, actor, fn);
}

/** Security-relevant events (roles, invites, settings, agent approvals…). */
export async function audit(
  tx: TransactionClient,
  ctx: WorkspaceCtx,
  entry: {
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.auditLog.create({
    data: {
      workspaceId: ctx.workspace.id,
      actorType: "USER",
      actorId: ctx.actor.userId,
      actorLabel: `${ctx.actor.name} <${ctx.actor.email}>`,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
    },
  });
}
