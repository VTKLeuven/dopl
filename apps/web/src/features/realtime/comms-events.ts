import type { QueryKey } from "@tanstack/react-query";
import { inboxKeys } from "@/features/inbox/keys";
import { chatKeys } from "@/features/messages/keys";

interface CommsEvent {
  topic: string;
  type: string;
  payload: Record<string, unknown> | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * Inbox and Messages part of the event → query-cache mapping (Phase 4).
 * Returns the queries to invalidate; the provider batches them with the
 * rest. Typing events are ephemeral and handled by the chat UI itself.
 */
export function commsInvalidations(ws: string, ev: CommsEvent): QueryKey[] {
  const [kind, id] = ev.topic.split(":");
  const p = ev.payload ?? {};
  if (kind === "user") {
    // notification.created / .updated: lists and badge counts.
    if (ev.type.startsWith("notification.")) return [inboxKeys.all(ws)];
    // channel.read / .joined / .left / .hidden in another tab or by someone else.
    if (ev.type.startsWith("channel.")) {
      const channelId = str(p.channelId);
      return [chatKeys.channels(ws), ...(channelId ? [chatKeys.channel(ws, channelId)] : [])];
    }
    return [];
  }
  if (kind === "channel" && id) {
    if (ev.type.startsWith("message.")) {
      const keys: QueryKey[] = [chatKeys.messages(ws, id), chatKeys.channels(ws)];
      const root = str(p.threadRootId);
      if (root) keys.push(chatKeys.thread(ws, root));
      const messageId = str(p.id);
      if (messageId) keys.push(chatKeys.thread(ws, messageId));
      return keys;
    }
    if (ev.type.startsWith("channel."))
      return [chatKeys.channel(ws, id), chatKeys.channels(ws), chatKeys.browse(ws)];
  }
  return [];
}
