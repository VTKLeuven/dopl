/**
 * Where a notification leads and how it reads in an email digest. The web
 * Inbox renders its own (translated) text; links are computed here so the
 * app and the digest always agree.
 */
import type { NotificationType } from "../schemas/inbox";

export interface NotificationTarget {
  type: NotificationType;
  entityType: string;
  entityId: string;
  workItemId: string | null;
  messageId: string | null;
  data: Record<string, unknown>;
  /** Resolved from the work item when known (INFRA-42, or the item id for requests). */
  identifier?: string | null;
  /** The request behind the item, when there is one. */
  intakeId?: string | null;
  projectIdentifier?: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Path inside the app (no origin), or null when there's nothing to open. */
export function notificationPath(ws: string, n: NotificationTarget): string | null {
  const base = `/${ws}`;
  const channelId = str(n.data.channelId);
  if (n.messageId && channelId) {
    const root = str(n.data.threadRootId);
    return root
      ? `${base}/messages/c/${channelId}?thread=${root}`
      : `${base}/messages/c/${channelId}?msg=${n.messageId}`;
  }
  switch (n.type) {
    case "INTAKE_UPDATED":
      return `${base}/requests/${n.entityId}`;
    case "COMMENT":
      if (n.entityType === "INTAKE_ITEM") return `${base}/requests/${n.entityId}`;
      break;
    case "INTAKE_SUBMITTED":
    case "SNOOZE_ENDED": {
      const ident = n.projectIdentifier ?? str(n.data.projectIdentifier);
      if (ident && n.entityType === "INTAKE_ITEM")
        return `${base}/p/${ident}/intake?peek=${n.entityId}`;
      break;
    }
    case "INTEGRATION_FAILED":
      return `${base}/settings/integrations`;
    case "EMAIL_ASSIGNED":
    case "EMAIL_MENTION":
    case "EMAIL_REPLY": {
      const thread =
        str(n.data.emailThreadId) ?? (n.entityType === "EMAIL_THREAD" ? n.entityId : null);
      if (thread) return `${base}/mail/${thread}`;
      break;
    }
    default:
      break;
  }
  if (n.workItemId) return `${base}/i/${n.identifier ?? str(n.data.identifier) ?? n.workItemId}`;
  return null;
}

/** English one-liners for the email digest (the web UI translates its own). */
export function digestLine(n: {
  type: NotificationType;
  actorName: string | null;
  data: Record<string, unknown>;
  identifier?: string | null;
}): { headline: string; detail: string } {
  const who = n.actorName ?? "Someone";
  const d = n.data;
  const title = str(d.title) ?? str(d.subject) ?? "";
  const item = n.identifier ?? str(d.identifier) ?? title;
  const channel = str(d.channelName);
  const where = channel ? `#${channel}` : item;
  const excerpt = str(d.excerpt);
  const count = typeof d.count === "number" && d.count > 1 ? ` (${d.count} updates)` : "";
  const line = (headline: string, detail = title): { headline: string; detail: string } => ({
    headline: `${headline}${count}`,
    detail: (excerpt ?? detail).slice(0, 200),
  });
  switch (n.type) {
    case "MENTION":
      return line(`${who} mentioned you in ${where}`);
    case "ASSIGNED":
      return line(`${who} assigned you ${item}`);
    case "WORK_ITEM_UPDATED":
      return line(str(d.to) ? `${who} moved ${item} to ${str(d.to)}` : `${who} updated ${item}`);
    case "COMMENT":
      return line(
        n.data.status === "reply"
          ? `${who} replied to your request`
          : `${who} commented on ${item}`,
      );
    case "THREAD_REPLY":
      return line(`${who} replied to a thread in ${where}`);
    case "INTAKE_SUBMITTED":
      return line(`New request in ${str(d.projectIdentifier) ?? "a project"}`, title);
    case "INTAKE_REPLY":
      return line(`${str(d.from) ?? who} replied on ${item}`);
    case "INTAKE_UPDATED":
      return line(`Your request was ${str(d.status) ?? "updated"}`);
    case "SNOOZE_ENDED":
      return line("A snoozed request is back in the queue");
    case "DUE_SOON":
      return line(`${item} is due soon`);
    case "AGENT_APPROVAL_REQUESTED":
      return line("Dopl is waiting for your approval");
    case "AGENT_RUN_FINISHED":
      return line("Dopl finished a task");
    case "EMAIL_ASSIGNED":
      return line(`${who} assigned you an email`);
    case "EMAIL_MENTION":
      return line(`${who} mentioned you on an email`);
    case "EMAIL_REPLY":
      return line("New reply on an email you follow");
    case "INTEGRATION_FAILED":
      return line(
        `Discord webhook ${str(d.name) ?? ""} was turned off`.replace("  ", " "),
        str(d.error) ?? "",
      );
  }
}
