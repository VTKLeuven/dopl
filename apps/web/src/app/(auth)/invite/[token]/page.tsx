import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { TriangleAlert } from "lucide-react";
import { googleEnabled } from "@/server/env";
import { findValidInvite } from "@/server/services/invites";
import { Skeleton } from "@/components/ui/skeleton";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Accept invite" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Suspense fallback={<InviteSkeleton />}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  const { token } = await params;
  const invite = await findValidInvite(token);
  const t = await getTranslations("auth");
  if (!invite) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex size-10 items-center justify-center rounded-card border border-border bg-warning-bg text-warning-text">
          <TriangleAlert className="size-5" />
        </div>
        <h1 className="text-title-lg font-semibold">{t("inviteInvalidTitle")}</h1>
        <p className="text-body text-fg-muted">{t("inviteInvalid")}</p>
        <Link href="/sign-in" className="text-body text-link hover:underline">
          {t("backToSignIn")}
        </Link>
      </div>
    );
  }
  return (
    <InviteForm
      token={token}
      email={invite.email}
      defaultName={invite.userName.includes("@") ? "" : invite.userName}
      workspaceName={invite.workspace.name}
      role={invite.role}
      googleEnabled={googleEnabled}
    />
  );
}

function InviteSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-9 w-full rounded-control" />
      <Skeleton className="h-9 w-full rounded-control" />
    </div>
  );
}
