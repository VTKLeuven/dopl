import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GmailMessage, GmailPart } from "../domain/mail";

/**
 * The fake Gmail's storage (dev, tests, e2e): one JSON file per mailbox,
 * `<dir>/<address>.json`, holding messages and a history log like Gmail's.
 * The worker's FakeGmail reads it; the dev seed and e2e specs write to it
 * with appendMessage. Node only: never import this from client code.
 */

export interface FakeHistoryRecord {
  id: string;
  messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }>;
}

export interface FakeStore {
  historyId: number;
  /** history.list from before this answers 404 (simulates Gmail expiring history). */
  minHistoryId: number;
  seq: number;
  messages: Record<string, GmailMessage>;
  history: FakeHistoryRecord[];
  sendAs: string[];
}

export const fakeStoreFile = (dir: string, address: string) =>
  path.join(dir, `${address.toLowerCase()}.json`);

export async function readStore(dir: string, address: string): Promise<FakeStore> {
  try {
    return JSON.parse(await readFile(fakeStoreFile(dir, address), "utf8")) as FakeStore;
  } catch {
    return { historyId: 1000, minHistoryId: 0, seq: 0, messages: {}, history: [], sendAs: [] };
  }
}

export async function writeStore(dir: string, address: string, store: FakeStore) {
  await mkdir(dir, { recursive: true });
  const target = fakeStoreFile(dir, address);
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
  /** More headers, e.g. a Google Group's X-Original-From. */
  headers?: Array<{ name: string; value: string }>;
  /** The Message-ID, to deliver one message to several mailboxes as a group does. */
  messageId?: string;
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
  const messageId = input.messageId ?? `<${id}@fake.dopl.test>`;
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
    ...(input.headers ?? []),
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
