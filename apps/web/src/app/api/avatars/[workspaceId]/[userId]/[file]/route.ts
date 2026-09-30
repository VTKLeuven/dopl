import { AVATAR_CONTENT_TYPES, type AvatarImageType } from "@dopl/shared/domain/avatar";
import { db } from "@/server/db";
import { getActor } from "@/server/session";
import { blobStore } from "@/server/storage";
import { avatarKey, parseAvatarRef } from "@/server/storage/avatars";

/**
 * A profile picture (D-133), for members of the workspace it belongs to.
 * The file name changes with every upload, so the response is immutable.
 */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/avatars/[workspaceId]/[userId]/[file]">,
) {
  const ref = parseAvatarRef(await params);
  if (!ref) return new Response("Not found", { status: 404 });
  const actor = await getActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const member = await db.workspaceMember.findFirst({
    where: { workspaceId: ref.workspaceId, userId: actor.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!member) return new Response("Not found", { status: 404 });

  const contentType = AVATAR_CONTENT_TYPES[ref.file.split(".")[1] as AvatarImageType];
  const store = blobStore();
  const key = avatarKey(ref);
  const url = await store.signedUrl(key, {
    filename: ref.file,
    disposition: "inline",
    contentType,
  });
  if (url) return Response.redirect(url, 302);
  const stream = await store.stream(key).catch(() => null);
  if (!stream) return new Response("Not found", { status: 404 });
  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
