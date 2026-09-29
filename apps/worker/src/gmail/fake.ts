import { appendMessage, readStore } from "@dopl/shared/testing/fake-gmail";
import { HistoryGoneError, type GmailApi } from "./client";

export {
  appendMessage,
  expireHistory,
  readStore,
  type FakeMessageInput,
} from "@dopl/shared/testing/fake-gmail";

/**
 * A Gmail stand-in backed by the fake store (@dopl/shared/testing/fake-gmail),
 * for dev, the worker tests and e2e, where there's no Google Workspace. A
 * spec appends a message; the worker's fake push notices the file change and
 * syncs, just as a real Pub/Sub notification would trigger it.
 */
export class FakeGmail implements GmailApi {
  constructor(
    private readonly dir: string,
    private readonly address: string,
  ) {}

  private store() {
    return readStore(this.dir, this.address);
  }

  async profile() {
    const s = await this.store();
    return { emailAddress: this.address, historyId: String(s.historyId) };
  }

  async labels() {
    return [
      { id: "INBOX", name: "INBOX", type: "system" },
      { id: "SENT", name: "SENT", type: "system" },
      { id: "UNREAD", name: "UNREAD", type: "system" },
    ];
  }

  async sendAs() {
    const s = await this.store();
    return [this.address, ...s.sendAs];
  }

  async listMessages(query: string, pageToken?: string | null) {
    const s = await this.store();
    const days = /newer_than:(\d+)d/.exec(query)?.[1];
    const since = days ? Date.now() - Number(days) * 86_400_000 : 0;
    const all = Object.values(s.messages)
      .filter((m) => Number(m.internalDate ?? 0) >= since)
      .sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0))
      .map((m) => ({ id: m.id, threadId: m.threadId }));
    const start = pageToken ? Number(pageToken) : 0;
    const page = all.slice(start, start + 50);
    return { ids: page, nextPageToken: start + 50 < all.length ? String(start + 50) : null };
  }

  async getMessage(id: string) {
    return (await this.store()).messages[id] ?? null;
  }

  async listHistory(startHistoryId: string, pageToken?: string | null) {
    const s = await this.store();
    const start = Number(startHistoryId);
    if (start < s.minHistoryId) throw new HistoryGoneError();
    const newer = s.history.filter((h) => Number(h.id) > start);
    const from = pageToken ? Number(pageToken) : 0;
    const page = newer.slice(from, from + 100);
    return {
      history: page,
      historyId: String(s.historyId),
      nextPageToken: from + 100 < newer.length ? String(from + 100) : null,
    };
  }

  async attachment(_messageId: string, attachmentId: string) {
    const data = attachmentId.slice(attachmentId.indexOf(":") + 1);
    return Buffer.from(data, "base64url");
  }

  async watch() {
    const s = await this.store();
    return { historyId: String(s.historyId), expiration: new Date(Date.now() + 7 * 86_400_000) };
  }

  async send(raw: string, threadId: string | null) {
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    const headerBlock = mime.slice(0, mime.search(/\r?\n\r?\n/));
    const get = (name: string) =>
      new RegExp(`^${name}:\\s*(.*)$`, "im").exec(headerBlock)?.[1]?.trim() ?? "";
    const sent = await appendMessage(this.dir, this.address, {
      from: this.address,
      to: get("To"),
      subject: get("Subject"),
      text: mime.slice(mime.search(/\r?\n\r?\n/)).trim(),
      threadId: threadId ?? undefined,
      inReplyTo: get("In-Reply-To") || undefined,
      labelIds: ["SENT"],
    });
    return { id: sent.id, threadId: sent.threadId };
  }
}
