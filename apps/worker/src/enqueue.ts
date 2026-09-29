import type { PgBoss } from "pg-boss";
import type { TransactionClient } from "@dopl/db";
import type { EnqueueDelivery } from "@dopl/server/webhooks";
import { queues, type QueueName, type QueuePayload } from "@dopl/shared/jobs/queues";

export type TxEnqueue = <Q extends QueueName>(
  tx: TransactionClient,
  queue: Q,
  payload: QueuePayload<Q>,
  options?: { singletonKey?: string; startAfter?: Date },
) => Promise<void>;

/**
 * Jobs inserted through the caller's transaction, so they exist iff the
 * change commits (same as the web's enqueue).
 */
export function txEnqueue(boss: PgBoss): TxEnqueue {
  return async (tx, queue, payload, options = {}) => {
    await boss.send(queue, queues[queue].parse(payload), {
      ...options,
      db: {
        executeSql: async (text: string, values?: unknown[]) => ({
          rows: await tx.$queryRawUnsafe<unknown[]>(text, ...(values ?? [])),
        }),
      },
    });
  };
}

/** The webhook dispatcher's enqueue, for jobs that post mail events (D-052). */
export const deliveryEnqueue =
  (enqueue: TxEnqueue): EnqueueDelivery =>
  (tx, deliveryId, startAfter) =>
    enqueue(tx, "webhook.deliver", { deliveryId }, startAfter ? { startAfter } : {});
