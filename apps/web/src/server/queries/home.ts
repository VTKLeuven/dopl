import "server-only";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere } from "./projects";

export interface InboxSummary {
  unread: number;
  latest: Array<{
    id: string;
    type: string;
    read: boolean;
    createdAt: string;
    actor: {
      id: string;
      name: string;
      image: string | null;
      kind: "HUMAN" | "AGENT" | "SYSTEM";
    } | null;
    item: { identifier: string; title: string } | null;
    title: string | null;
  }>;
}

/**
 * Home's inbox card: the unread count and the latest few notifications
 * (the full inbox lives at /[ws]/inbox). Snoozed and archived rows are left
 * out; items the member can no longer see lose their link.
 */
export async function getInboxSummary(ctx: WorkspaceCtx, take = 5): Promise<InboxSummary> {
  const now = new Date();
  const where = {
    workspaceId: ctx.workspace.id,
    recipientId: ctx.actor.userId,
    archivedAt: null,
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
  };
  const [unread, rows] = await Promise.all([
    db.notification.count({ where: { ...where, readAt: null } }),
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        type: true,
        readAt: true,
        createdAt: true,
        data: true,
        actor: { select: { id: true, name: true, image: true, kind: true } },
        workItem: {
          select: {
            sequence: true,
            title: true,
            deletedAt: true,
            project: { select: { id: true, identifier: true } },
          },
        },
      },
    }),
  ]);
  const projectIds = [
    ...new Set(rows.map((r) => r.workItem?.project.id).filter((x): x is string => Boolean(x))),
  ];
  const visible = new Set(
    projectIds.length
      ? (
          await db.project.findMany({
            where: { ...accessibleProjectsWhere(ctx), id: { in: projectIds } },
            select: { id: true },
          })
        ).map((p) => p.id)
      : [],
  );
  return {
    unread,
    latest: rows.map((r) => {
      const w = r.workItem;
      const data = (r.data ?? {}) as { title?: unknown };
      return {
        id: r.id,
        type: r.type,
        read: Boolean(r.readAt),
        createdAt: r.createdAt.toISOString(),
        actor: r.actor,
        item:
          w && !w.deletedAt && visible.has(w.project.id)
            ? { identifier: formatIdentifier(w.project.identifier, w.sequence), title: w.title }
            : null,
        title: typeof data.title === "string" ? data.title : null,
      };
    }),
  };
}
