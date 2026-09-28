import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { PolicyActor, WorkspaceRole } from "@dopl/shared/policy";
import { auth } from "./auth";
import { db } from "./db";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export interface Actor {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  kind: "HUMAN" | "AGENT" | "SYSTEM";
  twoFactorEnabled: boolean;
}

export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await getSession();
  if (!session) return null;
  const u = session.user as typeof session.user & { kind?: string; twoFactorEnabled?: boolean | null };
  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    kind: (u.kind as Actor["kind"] | undefined) ?? "HUMAN",
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
  };
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  return actor;
}

export interface WorkspaceCtx {
  actor: Actor;
  workspace: { id: string; slug: string; name: string; timezone: string; weekStartsOn: number };
  role: WorkspaceRole;
  canApproveAgentActions: boolean;
  policyActor: PolicyActor;
}

export const getWorkspaceCtx = cache(async (slug: string): Promise<WorkspaceCtx | null> => {
  const actor = await getActor();
  if (!actor) return null;
  const member = await db.workspaceMember.findFirst({
    where: { userId: actor.userId, status: "ACTIVE", workspace: { slug } },
    select: {
      role: true,
      canApproveAgentActions: true,
      workspace: { select: { id: true, slug: true, name: true, timezone: true, weekStartsOn: true } },
    },
  });
  if (!member) return null;
  return {
    actor,
    workspace: member.workspace,
    role: member.role,
    canApproveAgentActions: member.canApproveAgentActions,
    policyActor: {
      userId: actor.userId,
      kind: actor.kind,
      workspaceRole: member.role,
      canApproveAgentActions: member.canApproveAgentActions,
    },
  };
});

/**
 * Pages and actions inside /[ws]: signed in AND an active member, else 404.
 * Password-based Owners/Admins without 2FA are sent to enrol first (D-050);
 * only the account page itself passes `allowWithout2fa`.
 */
export async function requireWorkspaceCtx(
  slug: string,
  opts: { allowWithout2fa?: boolean } = {},
): Promise<WorkspaceCtx> {
  await requireActor();
  const ctx = await getWorkspaceCtx(slug);
  if (!ctx) notFound();
  if (!opts.allowWithout2fa && (await needsTwoFactorEnrollment(ctx))) {
    redirect(`/${slug}/settings/account?enroll=1` as never);
  }
  return ctx;
}

/** The workspace to land on after sign-in. */
export async function defaultWorkspaceSlug(userId: string): Promise<string | null> {
  const m = await db.workspaceMember.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { joinedAt: "asc" },
    select: { workspace: { select: { slug: true } } },
  });
  return m?.workspace.slug ?? null;
}

/** Password-based Owners/Admins must enrol in 2FA before using the app (D-050). */
export async function needsTwoFactorEnrollment(ctx: WorkspaceCtx): Promise<boolean> {
  if (ctx.actor.twoFactorEnabled) return false;
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") return false;
  const credential = await db.account.findFirst({
    where: { userId: ctx.actor.userId, providerId: "credential" },
    select: { id: true },
  });
  return Boolean(credential);
}
