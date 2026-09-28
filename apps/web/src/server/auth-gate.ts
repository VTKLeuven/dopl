import "server-only";
import { db } from "./db";

/**
 * Invite-only gate (D-050). A user may start a session when they are a human
 * and either already an ACTIVE member somewhere or hold a valid pending invite.
 */
export async function canStartSession(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      kind: true,
      email: true,
      memberships: { select: { status: true, workspaceId: true } },
    },
  });
  if (!user || user.kind !== "HUMAN") return false;
  if (user.memberships.some((m) => m.status === "ACTIVE")) return true;
  const invited = user.memberships.filter((m) => m.status === "INVITED").map((m) => m.workspaceId);
  if (invited.length === 0) return false;
  const validInvite = await db.workspaceInvite.findFirst({
    where: {
      workspaceId: { in: invited },
      email: user.email.toLowerCase(),
      revokedAt: null,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return Boolean(validInvite);
}

/** First successful sign-in accepts every valid pending invite for the user. */
export async function acceptPendingInvites(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) return;
  const now = new Date();
  await db.$transaction(async (tx) => {
    const invites = await tx.workspaceInvite.findMany({
      where: {
        email: user.email.toLowerCase(),
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { gt: now },
      },
    });
    for (const invite of invites) {
      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: now, acceptedUserId: userId },
      });
      await tx.workspaceMember.updateMany({
        where: { workspaceId: invite.workspaceId, userId, status: "INVITED" },
        data: { status: "ACTIVE", joinedAt: now },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: invite.workspaceId,
          actorType: "USER",
          actorId: userId,
          actorLabel: `${user.name} <${user.email}>`,
          action: "member.invite_accepted",
          targetType: "WorkspaceInvite",
          targetId: invite.id,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });
    }
    await tx.user.update({ where: { id: userId }, data: { lastActiveAt: now } });
  });
}

/** Only users that exist and may sign in get emails (no spam to strangers). */
export async function isEligibleEmail(email: string): Promise<{ userId: string } | null> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (!user) return null;
  return (await canStartSession(user.id)) ? { userId: user.id } : null;
}
