/**
 * Profile pictures (D-133). Only raster images, recognised by their first
 * bytes rather than the browser-reported type, so an SVG or HTML file renamed
 * to .png is refused.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export type AvatarImageType = "png" | "jpeg" | "gif" | "webp";

export const AVATAR_CONTENT_TYPES: Record<AvatarImageType, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

export function sniffAvatarType(bytes: Uint8Array): AvatarImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif"; // GIF8
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "webp";
  return null;
}

/** `<uuid>.<ext>`: the file segment of an avatar URL and storage key. */
export const AVATAR_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpeg|gif|webp)$/;
