/**
 * Shared-mailbox domain (ROADMAP §Phase 7): turning a Gmail `format=full`
 * message into what Dopl stores, and the thread rules. Pure, so the worker's
 * ingest and the tests share it.
 */

/* ───────────────────────── Gmail API shapes (the parts we read) ───────────────────────── */

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  /** Epoch milliseconds, as a string. */
  internalDate?: string;
  sizeEstimate?: number;
  payload?: GmailPart;
}

export interface Address {
  email: string;
  name: string | null;
}

export interface ParsedAttachment {
  attachmentId: string | null;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string | null;
  isInline: boolean;
}

export interface ParsedMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  labelIds: string[];
  rfc822MessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: string | null;
  subject: string;
  snippet: string;
  text: string | null;
  html: string | null;
  attachments: ParsedAttachment[];
  sentAt: Date;
  sizeEstimate: number | null;
  direction: "INBOUND" | "OUTBOUND";
}

/* ───────────────────────── addresses ───────────────────────── */

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Parses an address list ("Ann <ann@x.be>, \"Doe, J\" <j@x.be>, bob@x.be").
 * Commas inside quotes or angle brackets don't split.
 */
export function parseAddressList(raw: string | null | undefined): Address[] {
  if (!raw) return [];
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  let angle = 0;
  for (const ch of raw) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "<" && !quoted) angle++;
    else if (ch === ">" && !quoted) angle = Math.max(0, angle - 1);
    if (ch === "," && !quoted && angle === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const out: Address[] = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(.*?)<([^>]+)>\s*$/.exec(p);
    const email = normalizeEmail(m ? (m[2] ?? "") : p);
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) continue;
    const name = m
      ? (m[1] ?? "")
          .trim()
          .replace(/^"(.*)"$/, "$1")
          .trim()
      : "";
    out.push({ email, name: name ? decodeHeader(name) : null });
  }
  return out;
}

/* ───────────────────────── encodings ───────────────────────── */

/** base64url (Gmail's body encoding) → bytes. */
export function base64UrlToBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeBytes(bytes: Uint8Array, charset: string | null): string {
  const cs = (charset ?? "utf-8").toLowerCase().replace(/^"|"$/g, "");
  try {
    return new TextDecoder(cs === "us-ascii" ? "utf-8" : cs).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** RFC 2047 encoded words (=?utf-8?B?…?= / =?iso-8859-1?Q?…?=), as some headers arrive. */
export function decodeHeader(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?") // whitespace between encoded words is dropped
    .replace(
      /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
      (_, charset: string, enc: string, text: string) => {
        if (enc.toUpperCase() === "B") {
          return decodeBytes(
            base64UrlToBytes(text.replace(/\+/g, "-").replace(/\//g, "_")),
            charset,
          );
        }
        const bytes: number[] = [];
        const q = text.replace(/_/g, " ");
        for (let i = 0; i < q.length; i++) {
          if (q[i] === "=" && /^[0-9a-fA-F]{2}$/.test(q.slice(i + 1, i + 3))) {
            bytes.push(parseInt(q.slice(i + 1, i + 3), 16));
            i += 2;
          } else bytes.push(q.charCodeAt(i));
        }
        return decodeBytes(new Uint8Array(bytes), charset);
      },
    );
}

const header = (headers: GmailHeader[] | undefined, name: string): string | null => {
  const h = headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
};

function param(value: string | null, key: string): string | null {
  if (!value) return null;
  const m = new RegExp(`${key}\\s*=\\s*("([^"]*)"|[^;\\s]+)`, "i").exec(value);
  return m ? (m[2] ?? m[1] ?? null) : null;
}

/** Message ids from a References / In-Reply-To header. */
export const messageIds = (raw: string | null): string[] => raw?.match(/<[^>]+>/g) ?? [];

/** Gmail's snippet arrives HTML-escaped. */
export function unescapeSnippet(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/* ───────────────────────── parsing ───────────────────────── */

function walk(part: GmailPart, visit: (p: GmailPart) => void) {
  visit(part);
  for (const child of part.parts ?? []) walk(child, visit);
}

/**
 * A Gmail message → the stored shape. `mailboxAddresses` are the mailbox and
 * its send-as aliases: mail from one of them is outbound.
 */
export function parseGmailMessage(msg: GmailMessage, mailboxAddresses: string[]): ParsedMessage {
  const root = msg.payload ?? {};
  const headers = root.headers;
  let text: string | null = null;
  let html: string | null = null;
  const attachments: ParsedAttachment[] = [];

  walk(root, (p) => {
    const mime = (p.mimeType ?? "").toLowerCase();
    if (mime.startsWith("multipart/")) return;
    const disposition = (header(p.headers, "Content-Disposition") ?? "").toLowerCase();
    const contentId = header(p.headers, "Content-ID")?.replace(/^<|>$/g, "") ?? null;
    const isFile = Boolean(p.filename) || disposition.startsWith("attachment");
    if (!isFile && (mime === "text/plain" || mime === "text/html") && p.body?.data !== undefined) {
      const charset = param(header(p.headers, "Content-Type"), "charset");
      const body = decodeBytes(base64UrlToBytes(p.body.data), charset);
      if (mime === "text/plain" && text === null) text = body;
      if (mime === "text/html" && html === null) html = body;
      return;
    }
    if (isFile || contentId) {
      attachments.push({
        attachmentId: p.body?.attachmentId ?? null,
        filename: decodeHeader(p.filename || contentId || "attachment"),
        mimeType: mime || "application/octet-stream",
        size: p.body?.size ?? 0,
        contentId,
        isInline: Boolean(contentId) && !disposition.startsWith("attachment"),
      });
    }
  });

  const from = parseAddressList(header(headers, "From"))[0] ?? { email: "", name: null };
  const own = new Set(mailboxAddresses.map(normalizeEmail));
  const outbound = own.has(from.email) || (msg.labelIds ?? []).includes("SENT");
  const dateHeader = header(headers, "Date");
  const sentAt = msg.internalDate
    ? new Date(Number(msg.internalDate))
    : dateHeader
      ? new Date(dateHeader)
      : new Date(0);

  return {
    gmailMessageId: msg.id,
    gmailThreadId: msg.threadId,
    labelIds: msg.labelIds ?? [],
    rfc822MessageId:
      messageIds(header(headers, "Message-ID") ?? header(headers, "Message-Id"))[0] ?? null,
    inReplyTo: messageIds(header(headers, "In-Reply-To"))[0] ?? null,
    references: messageIds(header(headers, "References")),
    from,
    to: parseAddressList(header(headers, "To")),
    cc: parseAddressList(header(headers, "Cc")),
    bcc: parseAddressList(header(headers, "Bcc")),
    replyTo: parseAddressList(header(headers, "Reply-To"))[0]?.email ?? null,
    subject: decodeHeader(header(headers, "Subject") ?? "").trim(),
    snippet: unescapeSnippet(msg.snippet ?? ""),
    text,
    html,
    attachments,
    sentAt: Number.isNaN(sentAt.getTime()) ? new Date(0) : sentAt,
    sizeEstimate: msg.sizeEstimate ?? null,
    direction: outbound ? "OUTBOUND" : "INBOUND",
  };
}

/* ───────────────────────── thread rules ───────────────────────── */

export type ThreadStatus = "OPEN" | "SOLVED" | "IGNORED";

/** What a new message does to a thread (ARCHITECTURE §9). */
export function statusAfterMessage(
  status: ThreadStatus,
  direction: "INBOUND" | "OUTBOUND",
): { status: ThreadStatus; reopened: boolean } {
  // A customer writing back reopens a solved thread; our own replies don't.
  if (direction === "INBOUND" && status === "SOLVED") return { status: "OPEN", reopened: true };
  return { status, reopened: false };
}

/** Subject for display and matching: without Re:/Fwd: prefixes. */
export function baseSubject(subject: string): string {
  return subject.replace(/^(\s*(re|fw|fwd|aw|sv|antw)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
}

/** Plain text for search and previews when a message has only HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
