import "server-only";
import { canChannel } from "@dopl/shared/policy";
import type { ReferenceView } from "@/features/work-items/types";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { channelAccessSelect, toPolicyChannel } from "./channels";

/**
 * Chat references on a work item's timeline: messages that mention it
 * (`#INFRA-42`) or that it was created from. Only messages from channels
 * the reader can open are shown, so a private channel never leaks through
 * an item everyone can see. (Notes and email threads join in later phases.)
 */
export async function loadItemReferences(
  ctx: WorkspaceCtx,
  workItemId: string,
): Promise<ReferenceView[]> {
  if (ctx.role === "GUEST") return [];
  const rows = await db.workItemReference.findMany({
    where: { workItemId, messageId: { not: null }, message: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      kind: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
      message: {
        select: {
          id: true,
          threadRootId: true,
          bodyText: true,
          author: { select: { id: true, name: true } },
          channel: { select: channelAccessSelect(ctx.actor.userId) },
        },
      },
    },
  });
  const out: ReferenceView[] = [];
  for (const r of rows) {
    const msg = r.message;
    if (!msg) continue;
    if (!canChannel(ctx.policyActor, toPolicyChannel(msg.channel), "channel.view")) continue;
    const c = msg.channel;
    out.push({
      id: r.id,
      kind: r.kind,
      createdAt: r.createdAt.toISOString(),
      actorId: r.createdBy?.id ?? null,
      actorName: r.createdBy?.name ?? null,
      message: {
        id: msg.id,
        channelId: c.id,
        channelKind: c.kind,
        channelName:
          c.kind === "PROJECT" ? (c.project?.name ?? c.name) : c.kind === "CUSTOM" ? c.name : null,
        threadRootId: msg.threadRootId,
        excerpt: msg.bodyText.slice(0, 280),
        authorName: msg.author?.name ?? null,
      },
    });
  }
  return out;
}
