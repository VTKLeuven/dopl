import "server-only";
import { canChannel } from "@dopl/shared/policy";
import type {
  EmailReferenceView,
  MessageReferenceView,
  NoteReferenceView,
  ReferenceView,
} from "@/features/work-items/types";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { channelAccessSelect, toPolicyChannel } from "./channels";
import { readableMailboxIds } from "./mail";
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
  const emails = await loadEmailReferences(ctx, workItemId);
  // The timeline merges and orders every entry by time.
  return [...out, ...notes, ...emails];
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

/**
 * Email conversations on the item (Phase 7): the link itself, and each
 * message, so replies that arrive later show up on the timeline. Readers who
 * aren't members of the mailbox only see that a conversation is linked.
 */
async function loadEmailReferences(
  ctx: WorkspaceCtx,
  workItemId: string,
): Promise<EmailReferenceView[]> {
  const rows = await db.workItemReference.findMany({
    where: { workItemId, emailThreadId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      id: true,
      kind: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
      emailThread: {
        select: {
          id: true,
          subject: true,
          mailboxId: true,
          mailbox: { select: { emailAddress: true, displayName: true, ownerId: true } },
        },
      },
    },
  });
  if (rows.length === 0) return [];
  const readable = new Set(await readableMailboxIds(ctx));
  const out: EmailReferenceView[] = [];
  for (const r of rows) {
    const t = r.emailThread;
    if (!t) continue;
    const canRead = readable.has(t.mailboxId);
    const messages = canRead
      ? await db.emailMessage.findMany({
          where: { threadId: t.id },
          orderBy: { sentAt: "asc" },
          take: 50,
          select: {
            id: true,
            direction: true,
            fromAddress: true,
            fromName: true,
            sentAt: true,
            snippet: true,
            bodyText: true,
          },
        })
      : [];
    out.push({
      source: "email",
      id: r.id,
      kind: r.kind,
      createdAt: r.createdAt.toISOString(),
      actorId: r.createdBy?.id ?? null,
      actorName: r.createdBy?.name ?? null,
      thread: {
        id: t.id,
        subject: canRead ? t.subject : "",
        // Someone's personal mailbox isn't named to others either (D-138).
        mailbox:
          canRead || !t.mailbox.ownerId ? (t.mailbox.displayName ?? t.mailbox.emailAddress) : "",
        personal: t.mailbox.ownerId !== null,
        readable: canRead,
        messages: messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          from: m.fromName ?? m.fromAddress,
          sentAt: m.sentAt.toISOString(),
          excerpt: (m.bodyText ?? m.snippet).slice(0, 400),
        })),
      },
    });
  }
  return out;
}
