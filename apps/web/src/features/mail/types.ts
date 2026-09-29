import type { MailView } from "@dopl/shared/schemas/mail";

export interface MailboxSummary {
  id: string;
  emailAddress: string;
  displayName: string | null;
  status: "CONNECTING" | "BACKFILLING" | "ACTIVE" | "PAUSED" | "ERROR" | "DISCONNECTED";
  counts: Record<Extract<MailView, "unassigned" | "mine" | "open">, number>;
}

export interface Person {
  id: string;
  name: string;
  image: string | null;
}

export interface ThreadRow {
  id: string;
  mailboxId: string;
  subject: string;
  snippet: string;
  status: "OPEN" | "SOLVED" | "IGNORED";
  lastMessageAt: string;
  messageCount: number;
  hasAttachments: boolean;
  unread: boolean;
  snoozedUntil: string | null;
  assignee: Person | null;
  /** The external correspondent. */
  correspondent: { name: string | null; email: string } | null;
  labels: Array<{ id: string; name: string; color: string }>;
  linkedItems: number;
}

export interface ThreadPage {
  rows: ThreadRow[];
  nextCursor: string | null;
}

export interface MessageView {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  from: { email: string; name: string | null };
  to: Array<{ email: string; name: string | null }>;
  cc: Array<{ email: string; name: string | null }>;
  subject: string;
  sentAt: string;
  text: string | null;
  /** Sanitized at ingest; rendered only in a sandboxed iframe (D-028). */
  html: string | null;
  hasRemoteImages: boolean;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    isInline: boolean;
  }>;
  outboundStatus: "DRAFT" | "QUEUED" | "SENDING" | "SENT" | "FAILED" | null;
  outboundError: string | null;
  sentBy: Person | null;
}

export interface EmailCommentView {
  id: string;
  author: Person | null;
  body: unknown;
  createdAt: string;
}

export interface ThreadDetail extends ThreadRow {
  mailbox: { id: string; emailAddress: string; displayName: string | null; sendEnabled: boolean };
  messages: MessageView[];
  comments: EmailCommentView[];
  items: Array<{
    id: string;
    identifier: string;
    title: string;
    stateGroup: string;
    kind: "CREATED_FROM" | "LINKED" | "MENTIONED";
  }>;
  /** People the thread can be assigned to (they can read the mailbox). */
  assignable: Person[];
  canAct: boolean;
}

export interface MailboxAdmin extends MailboxSummary {
  backfillDays: number;
  backfillCompletedAt: string | null;
  lastSyncedAt: string | null;
  watchExpiresAt: string | null;
  syncError: string | null;
  syncErrorAt: string | null;
  sendEnabled: boolean;
  defaultAssigneeId: string | null;
  members: Person[];
  logs: Array<{
    id: string;
    kind: string;
    stats: Record<string, unknown>;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
  }>;
}
