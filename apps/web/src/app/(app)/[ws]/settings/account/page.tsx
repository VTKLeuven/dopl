import { Suspense } from "react";
import { db } from "@/server/db";
import { needsTwoFactorEnrollment, requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { AccountSettings } from "./account-settings";

export const metadata = { title: "Account & security" };

export default function AccountPage({ params }: PageProps<"/[ws]/settings/account">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={6} />}>
      <Account params={params} />
    </Suspense>
  );
}

async function Account({ params }: { params: PageProps<"/[ws]/settings/account">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws, { allowWithout2fa: true });
  const credential = await db.account.findFirst({
    where: { userId: ctx.actor.userId, providerId: "credential" },
    select: { id: true },
  });
  return (
    <AccountSettings
      ws={ws}
      user={{ name: ctx.actor.name, email: ctx.actor.email }}
      hasPassword={Boolean(credential)}
      twoFactorEnabled={ctx.actor.twoFactorEnabled}
      enrollmentRequired={await needsTwoFactorEnrollment(ctx)}
    />
  );
}
