"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "../auth";
import { db } from "../db";
import { findValidInvite } from "../services/invites";

const AcceptWithPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(128),
});

export type AcceptInviteResult = {
  ok: false;
  error: "invalid_invite" | "invalid_input" | "sign_in_failed";
};

/**
 * Accept an invite by choosing a password. The invite link proves control of
 * the email address, so the address is marked verified.
 */
export async function acceptInviteWithPassword(input: unknown): Promise<AcceptInviteResult> {
  const parsed = AcceptWithPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { token, name, password } = parsed.data;

  const invite = await findValidInvite(token);
  if (!invite) return { ok: false, error: "invalid_invite" };

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: invite.userId }, data: { name, emailVerified: true } });
    const existing = await tx.account.findFirst({
      where: { userId: invite.userId, providerId: "credential" },
      select: { id: true },
    });
    if (existing) {
      await tx.account.update({ where: { id: existing.id }, data: { password: hash } });
    } else {
      await tx.account.create({
        data: {
          userId: invite.userId,
          providerId: "credential",
          accountId: invite.userId,
          password: hash,
        },
      });
    }
  });

  try {
    await auth.api.signInEmail({
      body: { email: invite.email, password },
      headers: await headers(),
    });
  } catch {
    return { ok: false, error: "sign_in_failed" };
  }
  redirect(`/${invite.workspace.slug}/home` as never);
}
