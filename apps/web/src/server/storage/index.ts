import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Blob storage (D-037): local disk in dev/test, any S3-compatible store in prod. */
export interface BlobStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Stream for proxying through the app (local), or null when a redirect URL is used instead. */
  stream(key: string): Promise<ReadableStream | null>;
  /** Short-lived signed URL (S3); null for the local driver. */
  signedUrl(
    key: string,
    opts: { filename: string; disposition: "inline" | "attachment"; contentType: string },
  ): Promise<string | null>;
  delete(key: string): Promise<void>;
}

function repoRoot() {
  return path.resolve(
    process.cwd(),
    process.cwd().endsWith(path.join("apps", "web")) ? "../.." : ".",
  );
}

class LocalStore implements BlobStore {
  constructor(private dir: string) {}
  private file(key: string) {
    const p = path.resolve(this.dir, key);
    if (!p.startsWith(path.resolve(this.dir) + path.sep)) throw new Error("invalid key");
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.file(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async stream(key: string) {
    const p = this.file(key);
    await stat(p);
    return Readable.toWeb(createReadStream(p)) as ReadableStream;
  }
  async signedUrl() {
    return null;
  }
  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}

class S3Store implements BlobStore {
  private client: S3Client;
  constructor(private bucket: string) {
    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || "garage",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }
  async stream() {
    return null;
  }
  async signedUrl(
    key: string,
    opts: { filename: string; disposition: "inline" | "attachment"; contentType: string },
  ) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ResponseContentDisposition: `${opts.disposition}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`,
      }),
      { expiresIn: 300 },
    );
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let store: BlobStore | null = null;
export function blobStore(): BlobStore {
  store ??=
    process.env.STORAGE_DRIVER === "s3"
      ? new S3Store(process.env.S3_BUCKET ?? "dopl")
      : new LocalStore(path.resolve(repoRoot(), process.env.STORAGE_LOCAL_DIR ?? ".data/uploads"));
  return store;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Types we'll ever render inline; everything else is forced to download. */
export const INLINE_SAFE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
]);
