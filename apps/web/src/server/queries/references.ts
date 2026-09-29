import "server-only";
import { canChannel } from "@dopl/shared/policy";
import type {
  MessageReferenceView,
  NoteReferenceView,
  ReferenceView,
} from "@/features/work-items/types";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { channelAccessSelect, toPolicyChannel } from "./channels";
import { visibleNotesWhere } from "./notes";

/**
 * References on a work item's timeline: chat messages that mention it
 * (`#INFRA-42`) or that it was created from, and notes it was created from.
 * Only messages from channels the reader can open are shown, so a private
 * channel never leaks through an item everyone can see; a note the reader
 * can't open shows as "a private note" without its text. (Email threads
 * join in Phase 7.)
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
  const out: MessageReferenceView[] = [];
  for (const r of rows) {
    const msg = r.message;
    if (!msg) continue;
    if (!canChannel(ctx.policyActor, toPolicyChannel(msg.channel), "channel.view")) continue;
    const c = msg.channel;
    out.push({
      source: "message",
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
  const notes = await loadNoteReferences(ctx, workItemId);
  // The timeline merges and orders every entry by time.
  return [...out, ...notes];
}

async function loadNoteReferences(
  ctx: WorkspaceCtx,
  workItemId: string,
): Promise<NoteReferenceView[]> {
  const rows = await db.workItemReference.findMany({
    where: { workItemId, noteId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      kind: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
      noteTodo: { select: { text: true } },
      note: { select: { id: true, owner: { select: { name: true } } } },
    },
  });
  const ids = rows.flatMap((r) => (r.note ? [r.note.id] : []));
  const readable = new Map(
    (
      await db.note.findMany({
        where: { AND: [{ id: { in: ids }, deletedAt: null }, visibleNotesWhere(ctx)] },
        select: { id: true, contentText: true },
      })
    ).map((n) => [n.id, n.contentText]),
  );
  return rows.flatMap((r): NoteReferenceView[] => {
    if (!r.note) return [];
    const text = readable.get(r.note.id);
    return [
      {
        source: "note",
        id: r.id,
        kind: r.kind,
        createdAt: r.createdAt.toISOString(),
        actorId: r.createdBy?.id ?? null,
        actorName: r.createdBy?.name ?? null,
        note: {
          id: r.note.id,
          ownerName: r.note.owner.name,
          excerpt: text === undefined ? null : text.slice(0, 280),
          line: text === undefined ? null : (r.noteTodo?.text ?? null),
        },
      },
    ];
  });
}
