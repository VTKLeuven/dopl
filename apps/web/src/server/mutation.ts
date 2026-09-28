import "server-only";
import type { EntityType, Prisma, TransactionClient } from "@dopl/db";
import { uuidv7 } from "@dopl/shared/ids";
import { db } from "./db";
import type { WorkspaceCtx } from "./session";

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

export interface Mutation {
  tx: TransactionClient;
  ctx: WorkspaceCtx;
  batchId: string;
  activity(input: ActivityInput): void;
  emit(input: RealtimeInput): void;
}

/**
 * Every mutation runs through here (CLAUDE.md conventions): the change,
 * its Activity rows and its realtime outbox rows commit together, and
 * `pg_notify` fires on commit so listeners never see rolled-back changes.
 */
export async function withMutation<T>(ctx: WorkspaceCtx, fn: (m: Mutation) => Promise<T>): Promise<T> {
  return db.$transaction(
    async (tx) => {
      const activities: ActivityInput[] = [];
      const events: RealtimeInput[] = [];
      const batchId = uuidv7();
      const result = await fn({
        tx,
        ctx,
        batchId,
        activity: (a) => activities.push(a),
        emit: (e) => events.push(e),
      });

      if (activities.length > 0) {
        await tx.activity.createMany({
          data: activities.map((a) => ({
            workspaceId: ctx.workspace.id,
            projectId: a.projectId ?? null,
            workItemId: a.workItemId ?? null,
            entityType: a.entityType,
            entityId: a.entityId,
            verb: a.verb,
            field: a.field ?? null,
            fromValue: a.fromValue ?? undefined,
            toValue: a.toValue ?? undefined,
            meta: a.meta ?? {},
            actorType: ctx.actor.kind === "AGENT" ? "AGENT" : "USER",
            actorId: ctx.actor.userId,
            batchId,
          })),
        });
      }
      for (const e of events) {
        const row = await tx.realtimeEvent.create({
          data: { workspaceId: ctx.workspace.id, topic: e.topic, type: e.type, payload: e.payload },
          select: { id: true },
        });
        await tx.$executeRaw`SELECT pg_notify('dopl_realtime', ${row.id.toString()})`;
      }
      return result;
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
}

/** Security-relevant events (roles, invites, settings, agent approvals…). */
export async function audit(
  tx: TransactionClient,
  ctx: WorkspaceCtx,
  entry: { action: string; targetType?: string; targetId?: string; metadata?: Prisma.InputJsonValue },
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
