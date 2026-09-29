import "server-only";
import { db } from "../db";
import { channelAccessById } from "../queries/channels";
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
  /** channel id → may this member read it (same policy as the chat UI). */
  private channels = new Map<string, boolean>();

  constructor(private readonly ctx: WorkspaceCtx) {}

  async refresh() {
    this.channels.clear();
    const rows = await db.project.findMany({
      where: accessibleProjectsWhere(this.ctx),
      select: { id: true },
    });
    this.projects = new Set(rows.map((r) => r.id));
  }

  /** Events that change who can see what. */
  static affectsAccess(msg: RealtimeMessage): boolean {
    return (
      /^(project|member|invite)\./.test(msg.type) ||
      /^channel\.(created|updated|archived|membersChanged)$/.test(msg.type)
    );
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
      case "channel": {
        if (!id) return false;
        if (!this.channels.has(id)) {
          if (this.channels.size > 2_000) this.channels.clear();
          const visible = await channelAccessById(this.ctx, id).then(
            () => true,
            () => false,
          );
          this.channels.set(id, visible);
        }
        return this.channels.get(id) === true;
      }
      default:
        return false;
    }
  }
}
