import { watch } from "node:fs";
import path from "node:path";
import { JWT } from "google-auth-library";
import type { Logger } from "pino";
import type { DbClient } from "@dopl/db";
import type { TxEnqueue } from "../enqueue";
import { loadServiceAccountKey } from "./client";

/**
 * Gmail push (ROADMAP §7a.3): Gmail publishes {emailAddress, historyId} to a
 * Pub/Sub topic; the worker pulls from a subscription (no public webhook) and
 * queues a partial sync for that mailbox. pg-boss's singleton key keeps one
 * sync per mailbox in the queue, so bursts collapse. The REST pull blocks
 * until messages arrive, which is the same latency as the streaming client
 * without gRPC (D-108).
 */
export interface PushDeps {
  db: DbClient;
  logger: Logger;
  enqueue: TxEnqueue;
}

async function queueSyncFor(deps: PushDeps, emailAddress: string) {
  const mailboxes = await deps.db.mailbox.findMany({
    where: {
      emailAddress: { equals: emailAddress, mode: "insensitive" },
      status: "ACTIVE",
      deletedAt: null,
    },
    select: { id: true },
  });
  for (const m of mailboxes)
    await deps.db.$transaction((tx) =>
      deps.enqueue(tx, "gmail.sync", { mailboxId: m.id, reason: "push" }, { singletonKey: m.id }),
    );
  return mailboxes.length;
}

/** Pulls forever (until `signal` aborts). */
export async function runPubSubPull(
  deps: PushDeps,
  opts: { keyFile: string; subscription: string; signal: AbortSignal },
): Promise<void> {
  const key = await loadServiceAccountKey(opts.keyFile);
  const jwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/pubsub"],
  });
  const base = `https://pubsub.googleapis.com/v1/${opts.subscription}`;
  let backoff = 1_000;
  // A function, so the check after an await isn't narrowed away.
  const stopped = () => opts.signal.aborted;
  while (!stopped()) {
    try {
      const { token } = await jwt.getAccessToken();
      const headers = {
        authorization: `Bearer ${token ?? ""}`,
        "content-type": "application/json",
      };
      const res = await fetch(`${base}:pull`, {
        method: "POST",
        headers,
        body: JSON.stringify({ maxMessages: 20 }),
        signal: AbortSignal.any([opts.signal, AbortSignal.timeout(90_000)]),
      });
      if (!res.ok) throw new Error(`pubsub pull ${res.status}`);
      const body = (await res.json()) as {
        receivedMessages?: Array<{ ackId: string; message: { data?: string } }>;
      };
      const received = body.receivedMessages ?? [];
      const addresses = new Set<string>();
      for (const r of received) {
        try {
          const data = JSON.parse(Buffer.from(r.message.data ?? "", "base64").toString("utf8")) as {
            emailAddress?: string;
          };
          if (data.emailAddress) addresses.add(data.emailAddress);
        } catch {
          // Not a Gmail notification: ack it anyway so it doesn't come back.
        }
      }
      for (const a of addresses) await queueSyncFor(deps, a);
      if (received.length)
        await fetch(`${base}:acknowledge`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ackIds: received.map((r) => r.ackId) }),
        });
      backoff = 1_000;
    } catch (err) {
      if (stopped()) return;
      deps.logger.warn({ err }, "pubsub pull failed; retrying");
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}

/**
 * The fake mailbox's "push": a change to `<dir>/<address>.json` queues a sync
 * for that address, like a Pub/Sub notification would.
 */
export function watchFakeMailboxes(deps: PushDeps, dir: string): () => void {
  const timers = new Map<string, NodeJS.Timeout>();
  const watcher = watch(dir, (_event, filename) => {
    if (!filename || !filename.endsWith(".json")) return;
    const address = path.basename(filename, ".json");
    clearTimeout(timers.get(address));
    timers.set(
      address,
      setTimeout(() => {
        timers.delete(address);
        queueSyncFor(deps, address).catch((err: unknown) => {
          deps.logger.warn({ err, address }, "fake push failed");
        });
      }, 150),
    );
  });
  return () => {
    watcher.close();
  };
}
