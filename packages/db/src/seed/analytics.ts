/**
 * Analytics seed (Phase 6): 120 days of `project_daily_stats`, so "open items
 * over time" has history in dev. The nightly job records real snapshots; the
 * seed has no state history, so each past day is approximated from the items'
 * dates: done once `completedAt` passed, in progress once `startedAt` passed,
 * otherwise in its current not-started group (or "unstarted").
 */
import type { DbClient } from "../client";
import type { Prisma } from "../generated/prisma/client";

const DAY = 24 * 60 * 60 * 1000;
const OPEN = new Set(["BACKLOG", "UNSTARTED", "STARTED"]);

export async function seedAnalytics(
  db: DbClient,
  opts: { workspaceId: string; today: Date; days?: number },
): Promise<number> {
  const days = opts.days ?? 120;
  const items = await db.workItem.findMany({
    where: { workspaceId: opts.workspaceId, deletedAt: null, stateGroup: { not: "TRIAGE" } },
    select: {
      projectId: true,
      stateGroup: true,
      priority: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      dueDate: true,
    },
  });
  const byProject = new Map<string, typeof items>();
  for (const i of items) byProject.set(i.projectId, [...(byProject.get(i.projectId) ?? []), i]);

  const rows: Prisma.ProjectDailyStatCreateManyInput[] = [];
  // Past days only: today's numbers come live from the items.
  for (let d = days; d >= 1; d--) {
    const date = new Date(opts.today.getTime() - d * DAY);
    const end = new Date(date.getTime() + DAY);
    for (const [projectId, list] of byProject) {
      const byStateGroup: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      let openCount = 0;
      let createdCount = 0;
      let completedCount = 0;
      let overdueCount = 0;
      for (const i of list) {
        if (i.createdAt >= date && i.createdAt < end) createdCount++;
        if (i.completedAt && i.completedAt >= date && i.completedAt < end) completedCount++;
        if (i.createdAt >= end) continue;
        if (i.completedAt && i.completedAt < end) continue;
        if (!i.completedAt && !OPEN.has(i.stateGroup)) continue; // cancelled without a date
        const group =
          i.startedAt && i.startedAt < end
            ? "STARTED"
            : i.stateGroup === "BACKLOG"
              ? "BACKLOG"
              : "UNSTARTED";
        byStateGroup[group] = (byStateGroup[group] ?? 0) + 1;
        byPriority[i.priority] = (byPriority[i.priority] ?? 0) + 1;
        openCount++;
        if (i.dueDate && i.dueDate < date) overdueCount++;
      }
      rows.push({
        projectId,
        date,
        workspaceId: opts.workspaceId,
        byStateGroup,
        byPriority,
        openCount,
        createdCount,
        completedCount,
        cancelledCount: 0,
        overdueCount,
        intakeCount: 0,
      });
    }
  }
  await db.projectDailyStat.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}
