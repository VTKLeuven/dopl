import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { DbClient } from "@dopl/db";
import { blobStore } from "@dopl/server/storage";
import { queues } from "@dopl/shared/jobs/queues";
import { txEnqueue, type TxEnqueue } from "../enqueue";
import { sendReply } from "../gmail/send";
import { queueOptions } from "../queues";
import { env } from "../env";
import { GoogleGmail, loadServiceAccountKey, type GmailApi } from "../gmail/client";
import { FakeGmail } from "../gmail/fake";
import { runPubSubPull, watchFakeMailboxes } from "../gmail/pubsub";
import {
  activeMailboxIds,
  backfill,
  renewWatch,
  sync,
  testConnection,
  type SyncDeps,
} from "../gmail/sync";

/** GMAIL_FAKE_DIR is relative to the repo root, so the worker and e2e specs agree on it. */
export const fakeMailDir = (value: string) =>
  path.resolve(import.meta.dirname, "../../../..", value);

/** The Gmail client for a mailbox: the fake in dev/tests, else domain-wide delegation. */
export async function gmailFactory(): Promise<SyncDeps["gmailFor"]> {
  if (env.GMAIL_FAKE_DIR) {
    const dir = fakeMailDir(env.GMAIL_FAKE_DIR);
    return (m) => new FakeGmail(dir, m.emailAddress);
  }
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    return () => {
      throw new Error(
        "Gmail isn't configured: set GOOGLE_SERVICE_ACCOUNT_KEY_FILE on the worker (docs/ops/gmail-setup.md)",
      );
    };
  }
  const key = await loadServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
  return (m): GmailApi => new GoogleGmail(key, m.emailAddress, { send: m.sendEnabled });
}

/** Shared-mailbox queues and schedules (Phase 7). */
export async function registerMailHandlers(ctx: {
  boss: PgBoss;
  db: DbClient;
  logger: Logger;
  tz: { tz: string };
}): Promise<() => void> {
  const { boss, db, logger, tz } = ctx;
  const enqueue: TxEnqueue = txEnqueue(boss);
  const deps: SyncDeps = {
    db,
    logger,
    enqueue,
    gmailFor: await gmailFactory(),
    pubsubTopic: env.GMAIL_PUBSUB_TOPIC ?? null,
  };

  await boss.work("gmail.test", async ([job]) => {
    if (!job) return;
    const { mailboxId } = queues["gmail.test"].parse(job.data);
    const ok = await testConnection(deps, mailboxId);
    logger.info({ mailboxId, ok }, "gmail.test");
  });
  await boss.work("gmail.backfill", async ([job]) => {
    if (!job) return;
    const { mailboxId, kind } = queues["gmail.backfill"].parse(job.data);
    await backfill(deps, mailboxId, kind);
  });
  await boss.work("gmail.sync", { batchSize: 5 }, async (jobs) => {
    const seen = new Set<string>();
    for (const job of jobs) {
      const { mailboxId, reason } = queues["gmail.sync"].parse(job.data);
      if (seen.has(mailboxId)) continue;
      seen.add(mailboxId);
      await sync(deps, mailboxId, reason);
    }
  });
  await boss.work("gmail.send", async ([job]) => {
    if (!job) return;
    const { messageId } = queues["gmail.send"].parse(job.data);
    const r = await sendReply(deps, messageId, {
      retryCount: job.retryCount ?? 0,
      retryLimit: queueOptions.retryLimit,
    });
    logger.info({ messageId, r }, "gmail.send");
  });
  await boss.work("gmail.fetch-attachment", async ([job]) => {
    if (!job) return;
    const { attachmentId } = queues["gmail.fetch-attachment"].parse(job.data);
    await fetchAttachment(deps, attachmentId);
  });

  /** Mailboxes still waiting for their first connection test (seeded, or an enqueue that got lost). */
  const kickConnecting = async () => {
    const waiting = await db.mailbox.findMany({
      where: { status: "CONNECTING", deletedAt: null },
      select: { id: true },
    });
    for (const m of waiting)
      await db.$transaction((tx) =>
        enqueue(tx, "gmail.test", { mailboxId: m.id }, { singletonKey: `test:${m.id}` }),
      );
  };

  // Every 5 minutes: a safety-net sync in case pushes stop (or none are configured).
  await boss.schedule("gmail.poll", "*/5 * * * *", {}, tz);
  await boss.work("gmail.poll", async () => {
    await kickConnecting();
    for (const mailboxId of await activeMailboxIds(db))
      await db.$transaction((tx) =>
        enqueue(tx, "gmail.sync", { mailboxId, reason: "poll" }, { singletonKey: mailboxId }),
      );
  });
  await kickConnecting();
  // Daily: users.watch expires after 7 days.
  await boss.schedule("gmail.watch-renew", "40 3 * * *", {}, tz);
  await boss.work("gmail.watch-renew", async () => {
    for (const mailboxId of await activeMailboxIds(db))
      await renewWatch(deps, mailboxId).catch((err: unknown) =>
        logger.warn({ err, mailboxId }, "watch renew failed"),
      );
  });

  // Push: the fake directory in dev/tests, Pub/Sub in production.
  if (env.GMAIL_FAKE_DIR) {
    const dir = fakeMailDir(env.GMAIL_FAKE_DIR);
    mkdirSync(dir, { recursive: true });
    logger.info({ dir }, "gmail: using fake mailboxes");
    return watchFakeMailboxes({ db, logger, enqueue }, dir);
  }
  if (env.GMAIL_PUBSUB_SUBSCRIPTION && env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    const abort = new AbortController();
    void runPubSubPull(
      { db, logger, enqueue },
      {
        keyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
        subscription: env.GMAIL_PUBSUB_SUBSCRIPTION,
        signal: abort.signal,
      },
    );
    return () => abort.abort();
  }
  return () => {};
}

/**
 * First open of an email attachment (D-027): the worker downloads it into
 * blob storage; the web app waits for storageKey and serves it.
 */
export async function fetchAttachment(deps: SyncDeps, attachmentId: string): Promise<void> {
  const a = await deps.db.emailAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      storageKey: true,
      gmailAttachmentId: true,
      mimeType: true,
      message: {
        select: {
          gmailMessageId: true,
          workspaceId: true,
          thread: { select: { mailbox: { select: { emailAddress: true, sendEnabled: true } } } },
        },
      },
    },
  });
  if (!a || a.storageKey || !a.gmailAttachmentId || !a.message.gmailMessageId) return;
  const bytes = await deps
    .gmailFor(a.message.thread.mailbox)
    .attachment(a.message.gmailMessageId, a.gmailAttachmentId);
  const key = `mail/${a.message.workspaceId}/${a.id}`;
  await blobStore().put(key, Buffer.from(bytes), a.mimeType);
  await deps.db.emailAttachment.update({
    where: { id: a.id },
    data: { storageKey: key, fetchedAt: new Date() },
  });
}
