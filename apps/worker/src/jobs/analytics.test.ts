import { describe, expect, it } from "vitest";
import pino from "pino";
import { createDbClient } from "@dopl/db";
import { snapshotProjects } from "./analytics";

const db = createDbClient({
  connectionString: process.env.DATABASE_URL ?? "",
  applicationName: "dopl-worker-test",
  maxConnections: 2,
});
const logger = pino({ level: "silent" });

describe("analytics.snapshot", () => {
  it("writes one row per project and day, and overwrites it on a re-run", async () => {
    const ws = await db.workspace.create({
      data: { slug: `a-${crypto.randomUUID().slice(0, 8)}`, name: "Stats", timezone: "UTC" },
    });
    const project = await db.project.create({
      data: { workspaceId: ws.id, identifier: "ST", name: "Stats" },
    });
    const state = (group: "BACKLOG" | "STARTED" | "COMPLETED", sortKey: string) =>
      db.workflowState.create({
        data: {
          projectId: project.id,
          workspaceId: ws.id,
          name: group,
          group,
          color: "#888888",
          sortKey,
        },
      });
    const backlog = await state("BACKLOG", "a0");
    const started = await state("STARTED", "a1");
    const done = await state("COMPLETED", "a2");
    const now = new Date("2026-09-29T23:55:00Z");
    // Numbered like real items (only TRIAGE items have no sequence).
    let sequence = 0;
    const item = (s: Awaited<ReturnType<typeof state>>, extra: Record<string, unknown> = {}) =>
      db.workItem.create({
        data: {
          workspaceId: ws.id,
          projectId: project.id,
          sequence: ++sequence,
          title: "x",
          stateId: s.id,
          stateGroup: s.group,
          sortKey: crypto.randomUUID(),
          createdAt: new Date("2026-09-29T09:00:00Z"),
          ...extra,
        },
      });
    await item(backlog, { priority: "HIGH", dueDate: new Date("2026-09-20T00:00:00Z") });
    await item(backlog);
    await item(started, { createdAt: new Date("2026-09-01T09:00:00Z") });
    await item(done, { completedAt: new Date("2026-09-29T12:00:00Z") });

    expect(await snapshotProjects(db, logger, { now, workspaceId: ws.id })).toBe(1);
    const row = await db.projectDailyStat.findUniqueOrThrow({
      where: { projectId_date: { projectId: project.id, date: new Date("2026-09-29") } },
    });
    expect(row).toMatchObject({
      openCount: 3,
      byStateGroup: { BACKLOG: 2, STARTED: 1 },
      byPriority: { HIGH: 1, NONE: 2 },
      createdCount: 3, // the STARTED item was created on 1 September
      completedCount: 1,
      overdueCount: 1,
    });

    await item(started);
    await snapshotProjects(db, logger, { now, workspaceId: ws.id });
    expect(await db.projectDailyStat.count({ where: { projectId: project.id } })).toBe(1);
    const again = await db.projectDailyStat.findFirstOrThrow({ where: { projectId: project.id } });
    expect(again.openCount).toBe(4);
  });
});
