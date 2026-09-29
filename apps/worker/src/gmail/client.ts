import { readFile } from "node:fs/promises";
import { JWT } from "google-auth-library";
import type { GmailMessage } from "@dopl/shared/domain/mail";

/**
 * The Gmail API as the sync engine sees it: one connected mailbox. The real
 * client talks REST with a domain-wide-delegation token (D-027: only the
 * worker holds the key); FakeGmail (./fake.ts) backs dev, tests and e2e.
 */
export interface GmailApi {
  profile(): Promise<{ emailAddress: string; historyId: string }>;
  labels(): Promise<Array<{ id: string; name: string; type: string }>>;
  /** Send-as addresses (the mailbox and its aliases). */
  sendAs(): Promise<string[]>;
  listMessages(
    query: string,
    pageToken?: string | null,
  ): Promise<{ ids: Array<{ id: string; threadId: string }>; nextPageToken: string | null }>;
  /** format=full; null when the message is gone. */
  getMessage(id: string): Promise<GmailMessage | null>;
  /** Throws HistoryGoneError when startHistoryId is too old (404). */
  listHistory(
    startHistoryId: string,
    pageToken?: string | null,
  ): Promise<{ history: HistoryRecord[]; historyId: string; nextPageToken: string | null }>;
  attachment(messageId: string, attachmentId: string): Promise<Uint8Array>;
  watch(topicName: string): Promise<{ historyId: string; expiration: Date }>;
  /** Sends a raw RFC 822 message (base64url) in a thread (Phase 7b). */
  send(raw: string, threadId: string | null): Promise<{ id: string; threadId: string }>;
}

export interface HistoryRecord {
  id: string;
  messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }>;
  messagesDeleted?: Array<{ message: { id: string; threadId: string } }>;
  labelsAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }>;
  labelsRemoved?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }>;
}

/** history.list answered 404: the start point is older than Gmail keeps (about a week). */
export class HistoryGoneError extends Error {
  constructor() {
    super("history_gone");
  }
}

export class GmailApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const READ_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];
export const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

let keyCache: Promise<ServiceAccountKey> | null = null;
export function loadServiceAccountKey(file: string): Promise<ServiceAccountKey> {
  keyCache ??= readFile(file, "utf8").then((s) => JSON.parse(s) as ServiceAccountKey);
  return keyCache;
}

/** REST client for one mailbox, impersonated through domain-wide delegation. */
export class GoogleGmail implements GmailApi {
  private readonly jwt: JWT;
  private readonly base: string;

  constructor(
    key: ServiceAccountKey,
    private readonly mailbox: string,
    opts: { send?: boolean } = {},
  ) {
    this.jwt = new JWT({
      email: key.client_email,
      key: key.private_key,
      subject: mailbox,
      scopes: [...READ_SCOPES, ...(opts.send ? [SEND_SCOPE] : [])],
    });
    this.base = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(mailbox)}`;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { token } = await this.jwt.getAccessToken();
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token ?? ""}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GmailApiError(res.status, `gmail ${res.status}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async profile() {
    return this.call<{ emailAddress: string; historyId: string }>("/profile");
  }

  async labels() {
    const r = await this.call<{ labels?: Array<{ id: string; name: string; type: string }> }>(
      "/labels",
    );
    return r.labels ?? [];
  }

  async sendAs() {
    const r = await this.call<{ sendAs?: Array<{ sendAsEmail: string }> }>("/settings/sendAs");
    return [this.mailbox, ...(r.sendAs ?? []).map((s) => s.sendAsEmail)];
  }

  async listMessages(query: string, pageToken?: string | null) {
    const qs = new URLSearchParams({ q: query, maxResults: "100" });
    if (pageToken) qs.set("pageToken", pageToken);
    const r = await this.call<{
      messages?: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
    }>(`/messages?${qs.toString()}`);
    return { ids: r.messages ?? [], nextPageToken: r.nextPageToken ?? null };
  }

  async getMessage(id: string) {
    try {
      return await this.call<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
    } catch (err) {
      if (err instanceof GmailApiError && err.status === 404) return null;
      throw err;
    }
  }

  async listHistory(startHistoryId: string, pageToken?: string | null) {
    const qs = new URLSearchParams({ startHistoryId, maxResults: "500" });
    if (pageToken) qs.set("pageToken", pageToken);
    try {
      const r = await this.call<{
        history?: HistoryRecord[];
        historyId: string;
        nextPageToken?: string;
      }>(`/history?${qs.toString()}`);
      return {
        history: r.history ?? [],
        historyId: r.historyId,
        nextPageToken: r.nextPageToken ?? null,
      };
    } catch (err) {
      if (err instanceof GmailApiError && err.status === 404) throw new HistoryGoneError();
      throw err;
    }
  }

  async attachment(messageId: string, attachmentId: string) {
    const r = await this.call<{ data: string }>(
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    return Buffer.from(r.data, "base64url");
  }

  async watch(topicName: string) {
    const r = await this.call<{ historyId: string; expiration: string }>("/watch", {
      method: "POST",
      body: JSON.stringify({
        topicName,
        labelIds: ["INBOX", "SENT"],
        labelFilterBehavior: "include",
      }),
    });
    return { historyId: r.historyId, expiration: new Date(Number(r.expiration)) };
  }

  async send(raw: string, threadId: string | null) {
    return this.call<{ id: string; threadId: string }>("/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
    });
  }
}
