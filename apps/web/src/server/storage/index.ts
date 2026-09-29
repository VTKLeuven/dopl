import "server-only";

/* The blob store lives in @dopl/server so the worker uses the same one (email attachments). */
export { blobStore, INLINE_SAFE, MAX_UPLOAD_BYTES, type BlobStore } from "@dopl/server/storage";
