import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { DbClient, NotificationType, TransactionClient } from "@dopl/db";
import { digestLine, notificationPath } from "@dopl/shared/domain/notifications";
import { emailTemplates } from "@dopl/shared/emails";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";

export interface DigestDeps {
  db: DbClient;
  boss: Pick<PgBoss, "send">;
  logger: Logger;
  appUrl: string;
  now?: Date;
  /** Leave very fresh notifications for the app; someone may be reading them right now. */
  minAgeMs?: number;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 20;

/**
 * `email.digest` (every 10 minutes): for each person, the unread
 * notifications not emailed yet whose type they get by email (Settings →
 * Notifications; project rows override workspace rows; default off) become
 * one `inbox.digest` email. Rows are claimed with `emailedAt` in the same
 * transaction that queues the email, so overlapping runs can't send twice.
 * A grouped notification that gets new activity is un-emailed by notify()
 * and can appear in a later digest.
 */
export async function sendDigests(
  deps: DigestDeps,
): Promise<{ emails: number; notifications: number }> {
  const { db, logger } = deps;
  const now = deps.now ?? new Date();
  const newest = new Date(now.getTime() - (deps.minAgeMs ?? 2 * 60_000));
  const candidates = await db.notification.findMany({
    where: {
      readAt: null,
      emailedAt: null,
      archivedAt: null,
      createdAt: { gte: new Date(now.getTime() - WINDOW_MS), lte: newest },
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      recipient: { kind: "HUMAN" },
    },
    orderBy: { createdAt: "desc" },
    take: 5_000,
    select: {
      id: true,
      workspaceId: true,
      recipientId: true,
      projectId: true,
      type: true,
      entityType: true,
      entityId: true,
      workItemId: true,
      messageId: true,
      data: true,
      actor: { select: { name: true } },
      workItem: {
        select: {
          sequence: true,
          project: { select: { identifier: true } },
          intakeItem: { select: { number: true } },
        },
      },
    },
  });
  if (candidates.length === 0) return { emails: 0, notifications: 0 };

  const userIds = [...new Set(candidates.map((c) => c.recipientId))];
  const workspaceIds = [...new Set(candidates.map((c) => c.workspaceId))];
  const [prefs, members, workspaces] = await Promise.all([
    db.notificationPreference.findMany({
      where: { userId: { in: userIds }, workspaceId: { in: workspaceIds } },
      select: { userId: true, workspaceId: true, projectId: true, type: true, email: true },
    }),
    db.workspaceMember.findMany({
      where: { userId: { in: userIds }, workspaceId: { in: workspaceIds }, status: "ACTIVE" },
      select: { userId: true, workspaceId: true, user: { select: { email: true } } },
    }),
    db.workspace.findMany({
      where: { id: { in: workspaceIds } },
      select: { id: true, slug: true, name: true },
    }),
  ]);
  const emailOn = (
    userId: string,
    workspaceId: string,
    projectId: string | null,
    type: NotificationType,
  ) => {
    const mine = prefs.filter(
      (p) => p.userId === userId && p.workspaceId === workspaceId && p.type === type,
    );
    const effective =
      (projectId ? mine.find((p) => p.projectId === projectId) : undefined) ??
      mine.find((p) => p.projectId === null);
    return effective?.email ?? false;
  };

  const groups = new Map<string, typeof candidates>();
  for (const c of candidates) {
    if (!emailOn(c.recipientId, c.workspaceId, c.projectId, c.type)) continue;
    const key = `${c.workspaceId}:${c.recipientId}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  let emails = 0;
  let notifications = 0;
  for (const rows of groups.values()) {
    const first = rows[0];
    if (!first) continue;
    const member = members.find(
      (m) => m.userId === first.recipientId && m.workspaceId === first.workspaceId,
    );
    const ws = workspaces.find((w) => w.id === first.workspaceId);
    if (!member || !ws) continue;
    const sent = await db.$transaction(async (tx) => {
      // Claim: only rows nobody emailed in the meantime.
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE notifications SET "emailedAt" = ${now}
        WHERE id = ANY(${rows.map((r) => r.id)}::uuid[]) AND "emailedAt" IS NULL AND "readAt" IS NULL
        RETURNING id`;
      const ids = new Set(claimed.map((c) => c.id));
      const included = rows.filter((r) => ids.has(r.id));
      if (included.length === 0) return 0;
      const items = included.slice(0, MAX_ITEMS).map((n) => {
        const data = (n.data ?? {}) as Record<string, unknown>;
        const wi = n.workItem;
        const identifier = wi
          ? formatIdentifier(wi.project.identifier, wi.sequence, wi.intakeItem?.number)
          : null;
        const path = notificationPath(ws.slug, {
          type: n.type,
          entityType: n.entityType,
          entityId: n.entityId,
          workItemId: n.workItemId,
          messageId: n.messageId,
          data,
          identifier: wi?.sequence != null ? identifier : n.workItemId,
          projectIdentifier: wi?.project.identifier ?? null,
        });
        const line = digestLine({
          type: n.type,
          actorName: n.actor?.name ?? null,
          data,
          identifier,
        });
        return { ...line, url: `${deps.appUrl}${path ?? `/${ws.slug}/inbox`}` };
      });
      const payload = emailTemplates["inbox.digest"].parse({
        workspaceName: ws.name,
        total: included.length,
        items,
        inboxUrl: `${deps.appUrl}/${ws.slug}/inbox`,
        settingsUrl: `${deps.appUrl}/${ws.slug}/settings/notifications`,
      });
      const email = await tx.outboundEmail.create({
        data: {
          workspaceId: ws.id,
          kind: "inbox.digest",
          templateKey: "inbox.digest",
          toAddress: member.user.email,
          subject: "inbox.digest",
          payload,
          userId: first.recipientId,
        },
        select: { id: true },
      });
      await enqueueInTx(deps.boss, tx, email.id);
      return included.length;
    });
    if (sent > 0) {
      emails += 1;
      notifications += sent;
    }
  }
  if (emails > 0) logger.info({ emails, notifications }, "email.digest");
  return { emails, notifications };
}

/** Queue `email.send` through the same transaction, so the job exists iff the email row does. */
async function enqueueInTx(
  boss: Pick<PgBoss, "send">,
  tx: TransactionClient,
  outboundEmailId: string,
) {
  await boss.send(
    "email.send",
    { outboundEmailId },
    {
      db: {
        executeSql: async (text: string, values?: unknown[]) => ({
          rows: await tx.$queryRawUnsafe<unknown[]>(text, ...(values ?? [])),
        }),
      },
    },
  );
}
