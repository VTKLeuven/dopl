import type { Logger } from "pino";
import type { DbClient, MailboxSyncKind, Prisma } from "@dopl/db";
import type { TxEnqueue } from "../enqueue";
import { emitRealtime } from "../realtime";
import { HistoryGoneError, type GmailApi } from "./client";
import { ingestMessage, type MailboxRow } from "./ingest";

/**
 * The sync engine (ARCHITECTURE §9, ROADMAP §7a.3). Every run writes a
 * MailboxSyncLog row; the mailbox's status and error show on its settings page.
 *
 *   connect → gmail.test → gmail.backfill (resumable) → ACTIVE + watch
 *   push/poll → gmail.sync: history.list from historyId → ingest
 *   history 404 → gmail.backfill(FULL_RESYNC): re-list the window, ingest
 *     idempotently (unique on gmailMessageId, so no duplicates)
 */
export interface SyncDeps {
  db: DbClient;
  logger: Logger;
  enqueue: TxEnqueue;
  gmailFor: (mailbox: { emailAddress: string; sendEnabled: boolean }) => GmailApi;
  /** projects/<p>/topics/<t>; null when push isn't configured (polling only). */
  pubsubTopic: string | null;
}

const mailboxSelect = {
  id: true,
  workspaceId: true,
  emailAddress: true,
  defaultAssigneeId: true,
  status: true,
  historyId: true,
  backfillDays: true,
  backfillPageToken: true,
  sendEnabled: true,
  deletedAt: true,
} satisfies Prisma.MailboxSelect;

async function load(db: DbClient, id: string) {
  return db.mailbox.findUnique({ where: { id }, select: mailboxSelect });
}

/** Runs `fn` inside a sync log; errors are recorded on the log and the mailbox. */
async function logged<T>(
  deps: SyncDeps,
  mailbox: { id: string; workspaceId: string },
  kind: MailboxSyncKind,
  fn: (stats: Record<string, number | string>) => Promise<T>,
): Promise<T> {
  const log = await deps.db.mailboxSyncLog.create({
    data: { mailboxId: mailbox.id, kind },
    select: { id: true, startedAt: true },
  });
  const stats: Record<string, number | string> = {};
  try {
    const result = await fn(stats);
    await deps.db.mailboxSyncLog.update({
      where: { id: log.id },
      data: {
        stats: { ...stats, durationMs: Date.now() - log.startedAt.getTime() },
        finishedAt: new Date(),
      },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.db.mailboxSyncLog.update({
      where: { id: log.id },
      data: { stats, error: message.slice(0, 1000), finishedAt: new Date() },
    });
    await deps.db.mailbox.update({
      where: { id: mailbox.id },
      data: { syncError: message.slice(0, 1000), syncErrorAt: new Date() },
    });
    await announce(deps, mailbox);
    throw err;
  }
}

/** Settings pages and mail lists refresh when a mailbox's state changes. */
async function announce(deps: SyncDeps, mailbox: { id: string; workspaceId: string }) {
  await deps.db.$transaction((tx) =>
    emitRealtime(tx, {
      workspaceId: mailbox.workspaceId,
      topic: `mailbox:${mailbox.id}`,
      type: "mailbox.updated",
      payload: { id: mailbox.id },
    }),
  );
}

/**
 * "Test connection" (ROADMAP §7a.2): a token for the mailbox and its label
 * list. A new mailbox then starts its backfill; a failure leaves it in ERROR
 * with the reason.
 */
export async function testConnection(deps: SyncDeps, mailboxId: string): Promise<boolean> {
  const mailbox = await load(deps.db, mailboxId);
  if (!mailbox || mailbox.deletedAt) return false;
  try {
    await logged(deps, mailbox, "CONNECTION_TEST", async (stats) => {
      const gmail = deps.gmailFor(mailbox);
      const profile = await gmail.profile();
      const labels = await gmail.labels();
      stats.labels = labels.length;
      stats.address = profile.emailAddress;
      if (profile.emailAddress.toLowerCase() !== mailbox.emailAddress.toLowerCase())
        throw new Error(`token is for ${profile.emailAddress}, not ${mailbox.emailAddress}`);
    });
  } catch {
    await deps.db.mailbox.update({ where: { id: mailbox.id }, data: { status: "ERROR" } });
    await announce(deps, mailbox);
    return false;
  }
  const first = mailbox.status === "CONNECTING" || mailbox.status === "ERROR";
  await deps.db.$transaction(async (tx) => {
    await tx.mailbox.update({
      where: { id: mailbox.id },
      data: {
        syncError: null,
        syncErrorAt: null,
        ...(first ? { status: mailbox.historyId ? "ACTIVE" : "BACKFILLING" } : {}),
      },
    });
    if (first && !mailbox.historyId)
      await deps.enqueue(
        tx,
        "gmail.backfill",
        { mailboxId: mailbox.id, kind: "BACKFILL" },
        {
          singletonKey: `backfill:${mailbox.id}`,
        },
      );
  });
  await announce(deps, mailbox);
  return true;
}

/**
 * Backfill (connect) or full resync (history 404): page through the window,
 * newest first, storing the page token after each page so a crash resumes.
 * The history id is taken *before* listing, so nothing that arrives during the
 * backfill is missed by the next partial sync.
 */
export async function backfill(
  deps: SyncDeps,
  mailboxId: string,
  kind: "BACKFILL" | "FULL_RESYNC",
): Promise<void> {
  const mailbox = await load(deps.db, mailboxId);
  if (!mailbox || mailbox.deletedAt || mailbox.status === "PAUSED") return;
  const gmail = deps.gmailFor(mailbox);
  await logged(deps, mailbox, kind, async (stats) => {
    let token = mailbox.backfillPageToken;
    let startHistoryId = mailbox.historyId;
    if (!token || kind === "FULL_RESYNC") {
      startHistoryId = (await gmail.profile()).historyId;
      token = null;
    }
    const addresses = await gmail.sendAs();
    let created = 0;
    let updated = 0;
    let pages = 0;
    do {
      const page = await gmail.listMessages(
        `newer_than:${mailbox.backfillDays}d -in:chats -in:drafts`,
        token,
      );
      for (const { id } of page.ids) {
        const msg = await gmail.getMessage(id);
        if (!msg) continue;
        const r = await ingestMessage(deps, mailbox, msg, { addresses, live: false });
        if (r === "created") created++;
        else if (r === "updated") updated++;
      }
      token = page.nextPageToken;
      pages++;
      await deps.db.mailbox.update({
        where: { id: mailbox.id },
        data: { backfillPageToken: token },
      });
    } while (token);
    Object.assign(stats, { created, updated, pages });
    await deps.db.mailbox.update({
      where: { id: mailbox.id },
      data: {
        status: "ACTIVE",
        historyId: startHistoryId,
        backfillPageToken: null,
        ...(kind === "BACKFILL" ? { backfillCompletedAt: new Date() } : {}),
        lastFullSyncAt: new Date(),
        lastSyncedAt: new Date(),
        syncError: null,
        syncErrorAt: null,
      },
    });
  });
  await announce(deps, mailbox);
  // Catch up on anything that arrived while listing, then start push.
  await sync(deps, mailboxId, "manual");
  if (deps.pubsubTopic) await renewWatch(deps, mailboxId);
}

/**
 * Partial sync from the stored historyId (a push, the 5-minute poll, or a
 * manual refresh). A 404 means the history is gone: queue a full resync.
 */
export async function sync(
  deps: SyncDeps,
  mailboxId: string,
  reason: "push" | "poll" | "manual",
): Promise<void> {
  const mailbox = await load(deps.db, mailboxId);
  if (!mailbox || mailbox.deletedAt || mailbox.status !== "ACTIVE" || !mailbox.historyId) return;
  const gmail = deps.gmailFor(mailbox);
  try {
    await logged(deps, mailbox, reason === "poll" ? "POLL" : "PARTIAL", async (stats) => {
      const addresses = await gmail.sendAs();
      const from = mailbox.historyId as string;
      let token: string | null = null;
      let latest = from;
      const ids = new Set<string>();
      const labelChanges = new Map<string, string[]>();
      do {
        const page = await gmail.listHistory(from, token);
        for (const h of page.history) {
          for (const a of h.messagesAdded ?? []) ids.add(a.message.id);
          for (const l of [...(h.labelsAdded ?? []), ...(h.labelsRemoved ?? [])])
            if (l.message.labelIds) labelChanges.set(l.message.id, l.message.labelIds);
        }
        latest = page.historyId;
        token = page.nextPageToken;
      } while (token);
      let created = 0;
      for (const id of ids) {
        const msg = await gmail.getMessage(id);
        if (
          msg &&
          (await ingestMessage(deps, mailbox, msg, { addresses, live: true })) === "created"
        )
          created++;
      }
      for (const [id, labelIds] of labelChanges) {
        if (ids.has(id)) continue;
        await deps.db.emailMessage.updateMany({
          where: { mailboxId: mailbox.id, gmailMessageId: id },
          data: { gmailLabelIds: labelIds },
        });
      }
      Object.assign(stats, { fromHistoryId: from, toHistoryId: latest, created, seen: ids.size });
      await deps.db.mailbox.update({
        where: { id: mailbox.id },
        data: { historyId: latest, lastSyncedAt: new Date(), syncError: null, syncErrorAt: null },
      });
    });
  } catch (err) {
    if (!(err instanceof HistoryGoneError)) throw err;
    deps.logger.warn({ mailboxId }, "gmail history gone; full resync");
    await deps.db.$transaction((tx) =>
      deps.enqueue(
        tx,
        "gmail.backfill",
        { mailboxId, kind: "FULL_RESYNC" },
        {
          singletonKey: `backfill:${mailboxId}`,
        },
      ),
    );
  }
}

/** users.watch, renewed daily (it expires after 7 days). */
export async function renewWatch(deps: SyncDeps, mailboxId: string): Promise<void> {
  if (!deps.pubsubTopic) return;
  const mailbox = await load(deps.db, mailboxId);
  if (!mailbox || mailbox.deletedAt || mailbox.status !== "ACTIVE") return;
  await logged(deps, mailbox, "WATCH_RENEW", async (stats) => {
    const r = await deps.gmailFor(mailbox).watch(deps.pubsubTopic as string);
    stats.expiration = r.expiration.toISOString();
    await deps.db.mailbox.update({
      where: { id: mailbox.id },
      data: { watchExpiresAt: r.expiration },
    });
  });
}

export async function activeMailboxIds(db: DbClient): Promise<string[]> {
  const rows = await db.mailbox.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export type { MailboxRow };
