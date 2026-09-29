import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GmailMessage, GmailPart } from "@dopl/shared/domain/mail";
import { HistoryGoneError, type GmailApi, type HistoryRecord } from "./client";

/**
 * A Gmail stand-in backed by one JSON file per mailbox
 * (`$GMAIL_FAKE_DIR/<address>.json`), for dev, the worker tests and e2e,
 * where there's no Google Workspace to talk to. A spec appends a message with
 * `appendMessage`; the worker's fake Pub/Sub notices the file change and syncs,
 * just as a real push would trigger it.
 */

interface Store {
  historyId: number;
  /** history.list from before this answers 404 (simulates Gmail expiring history). */
  minHistoryId: number;
  seq: number;
  messages: Record<string, GmailMessage>;
  history: HistoryRecord[];
  sendAs: string[];
}

const file = (dir: string, address: string) => path.join(dir, `${address.toLowerCase()}.json`);

export async function readStore(dir: string, address: string): Promise<Store> {
  try {
    return JSON.parse(await readFile(file(dir, address), "utf8")) as Store;
  } catch {
    return { historyId: 1000, minHistoryId: 0, seq: 0, messages: {}, history: [], sendAs: [] };
  }
}

async function writeStore(dir: string, address: string, store: Store) {
  await mkdir(dir, { recursive: true });
  const target = file(dir, address);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(store));
  await rename(tmp, target); // atomic: the watcher never reads half a file
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

export interface FakeMessageInput {
  from: string;
  fromName?: string;
  to?: string;
  subject: string;
  text?: string;
  html?: string;
  /** Reply in an existing Gmail thread. */
  threadId?: string;
  inReplyTo?: string;
  labelIds?: string[];
  attachments?: Array<{ filename: string; mimeType: string; content: string }>;
  /** Defaults to now. */
  date?: Date;
}

/** Adds a message to the fake mailbox, as if it had just arrived. */
export async function appendMessage(
  dir: string,
  address: string,
  input: FakeMessageInput,
): Promise<{ id: string; threadId: string; messageId: string }> {
  const store = await readStore(dir, address);
  store.seq += 1;
  store.historyId += 1;
  const id = `fake${store.seq.toString(16).padStart(8, "0")}${Date.now().toString(16)}`;
  const threadId = input.threadId ?? id;
  const messageId = `<${id}@fake.dopl.test>`;
  const date = input.date ?? new Date();
  const headers = [
    { name: "From", value: input.fromName ? `${input.fromName} <${input.from}>` : input.from },
    { name: "To", value: input.to ?? address },
    { name: "Subject", value: input.subject },
    { name: "Date", value: date.toUTCString() },
    { name: "Message-ID", value: messageId },
    ...(input.inReplyTo
      ? [
          { name: "In-Reply-To", value: input.inReplyTo },
          { name: "References", value: input.inReplyTo },
        ]
      : []),
  ];
  const bodies: GmailPart[] = [];
  if (input.text !== undefined)
    bodies.push({
      mimeType: "text/plain",
      headers: [],
      body: { data: b64(input.text), size: input.text.length },
    });
  if (input.html !== undefined)
    bodies.push({
      mimeType: "text/html",
      headers: [],
      body: { data: b64(input.html), size: input.html.length },
    });
  const files: GmailPart[] = (input.attachments ?? []).map((a, i) => ({
    mimeType: a.mimeType,
    filename: a.filename,
    headers: [{ name: "Content-Disposition", value: `attachment; filename="${a.filename}"` }],
    // The fake keeps attachment bytes in the id (base64url), so attachment() can return them.
    body: { attachmentId: `att${i}:${b64(a.content)}`, size: a.content.length },
  }));
  const payload: GmailPart = {
    mimeType: "multipart/mixed",
    headers,
    parts: [{ mimeType: "multipart/alternative", parts: bodies }, ...files],
  };
  const labelIds = input.labelIds ?? ["INBOX", "UNREAD"];
  store.messages[id] = {
    id,
    threadId,
    labelIds,
    snippet: (input.text ?? input.html ?? "").replace(/<[^>]+>/g, " ").slice(0, 120),
    historyId: String(store.historyId),
    internalDate: String(date.getTime()),
    sizeEstimate: (input.text ?? "").length + (input.html ?? "").length,
    payload,
  };
  store.history.push({
    id: String(store.historyId),
    messagesAdded: [{ message: { id, threadId, labelIds } }],
  });
  await writeStore(dir, address, store);
  return { id, threadId, messageId };
}

/** Makes every earlier history id "too old", so the next partial sync gets a 404. */
export async function expireHistory(dir: string, address: string): Promise<void> {
  const store = await readStore(dir, address);
  store.minHistoryId = store.historyId;
  await writeStore(dir, address, store);
}

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
