import type { Logger } from "pino";
import type { DbClient, Prisma } from "@dopl/db";

const OPEN = ["BACKLOG", "UNSTARTED", "STARTED"] as const;

/** The calendar date of an instant in a time zone (YYYY-MM-DD). */
function dayIn(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Nightly (23:55 in the workspace's zone): each project's open items by state
 * group and priority, and the day's created/completed/cancelled/overdue/intake
 * counts, as one `project_daily_stats` row per project and day. Re-running on
 * the same day overwrites that day's row. Charts add today's live numbers
 * themselves, so the latest point is never stale.
 */
export async function snapshotProjects(
  db: DbClient,
  logger: Logger,
  opts: { now?: Date; workspaceId?: string } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const workspaces = await db.workspace.findMany({
    where: opts.workspaceId ? { id: opts.workspaceId } : {},
    select: { id: true, timezone: true },
  });
  let rows = 0;
  for (const ws of workspaces) {
    const day = dayIn(ws.timezone, now);
    // `date` is the @db.Date key; `since` is midnight of that day in the zone.
    const date = new Date(`${day}T00:00:00Z`);
    const since = new Date(startOfDay(ws.timezone, day));
    const projects = await db.project.findMany({
      where: { workspaceId: ws.id, deletedAt: null, archivedAt: null },
      select: { id: true },
    });
    if (projects.length === 0) continue;
    const ids = projects.map((p) => p.id);
    const base = { workspaceId: ws.id, projectId: { in: ids }, deletedAt: null };
    const [open, created, completed, cancelled, overdue, intake] = await Promise.all([
      db.workItem.groupBy({
        by: ["projectId", "stateGroup", "priority"],
        where: { ...base, archivedAt: null, stateGroup: { in: [...OPEN] } },
        _count: { _all: true },
      }),
      db.workItem.groupBy({
        by: ["projectId"],
        where: { ...base, stateGroup: { not: "TRIAGE" }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.workItem.groupBy({
        by: ["projectId"],
        where: { ...base, stateGroup: "COMPLETED", completedAt: { gte: since } },
        _count: { _all: true },
      }),
      db.workItem.groupBy({
        by: ["projectId"],
        where: { ...base, stateGroup: "CANCELLED", completedAt: { gte: since } },
        _count: { _all: true },
      }),
      db.workItem.groupBy({
        by: ["projectId"],
        where: {
          ...base,
          archivedAt: null,
          stateGroup: { in: [...OPEN] },
          dueDate: { lt: date },
        },
        _count: { _all: true },
      }),
      db.intakeItem.groupBy({
        by: ["projectId"],
        where: { projectId: { in: ids }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const count = (list: Array<{ projectId: string; _count: { _all: number } }>, id: string) =>
      list.find((g) => g.projectId === id)?._count._all ?? 0;
    for (const id of ids) {
      const byStateGroup: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      let openCount = 0;
      for (const g of open) {
        if (g.projectId !== id) continue;
        byStateGroup[g.stateGroup] = (byStateGroup[g.stateGroup] ?? 0) + g._count._all;
        byPriority[g.priority] = (byPriority[g.priority] ?? 0) + g._count._all;
        openCount += g._count._all;
      }
      const data = {
        workspaceId: ws.id,
        byStateGroup: byStateGroup as Prisma.InputJsonValue,
        byPriority: byPriority as Prisma.InputJsonValue,
        openCount,
        createdCount: count(created, id),
        completedCount: count(completed, id),
        cancelledCount: count(cancelled, id),
        overdueCount: count(overdue, id),
        intakeCount: count(intake, id),
      };
      await db.projectDailyStat.upsert({
        where: { projectId_date: { projectId: id, date } },
        create: { projectId: id, date, ...data },
        update: data,
      });
      rows++;
    }
  }
  logger.info({ rows }, "analytics.snapshot");
  return rows;
}

/** Epoch ms of midnight on `day` in `timeZone`. */
function startOfDay(timeZone: string, day: string): number {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  // Offset of the zone at that moment: format the UTC instant in the zone and diff.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utcMidnight);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return utcMidnight.getTime() - (asLocal - utcMidnight.getTime());
}
