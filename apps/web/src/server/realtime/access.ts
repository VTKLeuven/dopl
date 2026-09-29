import "server-only";
import { db } from "../db";
import { accessibleProjectsWhere } from "../queries/projects";
import type { WorkspaceCtx } from "../session";
import type { RealtimeMessage } from "./listener";

/**
 * Per-connection permission snapshot: which topics this member may receive.
 * Refreshed when project or membership events arrive, so fan-out needs no
 * query per event (except a cached item → project lookup for item topics).
 */
export class TopicAccess {
  private projects = new Set<string>();
  private itemProject = new Map<string, string | null>();

  constructor(private readonly ctx: WorkspaceCtx) {}

  async refresh() {
    const rows = await db.project.findMany({
      where: accessibleProjectsWhere(this.ctx),
      select: { id: true },
    });
    this.projects = new Set(rows.map((r) => r.id));
  }

  /** Events that change who can see what. */
  static affectsAccess(msg: RealtimeMessage): boolean {
    return /^(project|member|invite)\./.test(msg.type);
  }

  async allows(msg: RealtimeMessage): Promise<boolean> {
    const [kind, id] = msg.topic.split(":");
    switch (kind) {
      case "workspace":
        return id === this.ctx.workspace.id;
      case "project":
        return Boolean(id && this.projects.has(id));
      case "user":
        return id === this.ctx.actor.userId;
      case "workItem": {
        if (!id) return false;
        if (!this.itemProject.has(id)) {
          if (this.itemProject.size > 5_000) this.itemProject.clear();
          const item = await db.workItem.findUnique({ where: { id }, select: { projectId: true } });
          this.itemProject.set(id, item?.projectId ?? null);
        }
        const projectId = this.itemProject.get(id);
        return Boolean(projectId && this.projects.has(projectId));
      }
      default:
        return false;
    }
  }
}
