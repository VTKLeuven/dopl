import "server-only";
import { AVATAR_FILE_RE } from "@dopl/shared/domain/avatar";

/**
 * Profile pictures (D-133) live in the blob store under the workspace, and
 * `User.image` holds the app URL that serves them to signed-in members. Each
 * upload gets a new file name, so the URL can be cached for good.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const URL_RE = new RegExp(`^/api/avatars/(${UUID})/(${UUID})/([^/]+)$`);

export interface AvatarRef {
  workspaceId: string;
  userId: string;
  file: string;
}

export const avatarKey = (a: AvatarRef) => `${a.workspaceId}/avatars/${a.userId}/${a.file}`;
export const avatarUrl = (a: AvatarRef) => `/api/avatars/${a.workspaceId}/${a.userId}/${a.file}`;

/** The reference behind an avatar URL, or null for anything else (e.g. a Google photo). */
export function parseAvatarRef(parts: { workspaceId: string; userId: string; file: string }) {
  const url = avatarUrl(parts);
  return parseAvatarUrl(url);
}

export function parseAvatarUrl(url: string): AvatarRef | null {
  const m = URL_RE.exec(url);
  if (!m || !AVATAR_FILE_RE.test(m[3]!)) return null;
  return { workspaceId: m[1]!, userId: m[2]!, file: m[3]! };
}
