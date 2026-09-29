import "server-only";
import { hashToken } from "@dopl/shared/crypto";
import { db } from "../db";

export interface ValidInvite {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
  workspace: { id: string; name: string; slug: string };
  userId: string;
  userName: string;
}

/** Resolves an invite token to a usable invite, or null (expired/revoked/used). */
export async function findValidInvite(token: string): Promise<ValidInvite | null> {
  if (!token || token.length > 200) return null;
  const invite = await db.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      revokedAt: true,
      acceptedAt: true,
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date())
    return null;
  const user = await db.user.findUnique({
    where: { email: invite.email },
    select: { id: true, name: true },
  });
  if (!user) return null;
  return { ...invite, userId: user.id, userName: user.name };
}
