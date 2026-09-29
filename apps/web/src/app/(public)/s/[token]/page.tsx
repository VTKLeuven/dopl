import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LinkIcon } from "lucide-react";
import { buildPublicRequestView } from "@/server/queries/intake";
import { resolveStatusToken } from "@/server/services/public-intake";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPageClient } from "./status-client";

export const metadata: Metadata = {
  title: "Request status",
  robots: { index: false, follow: false },
};

/**
 * A contact's status page (/s/<token>). The token in the confirmation email
 * is the only credential; it renews on use and never reveals anything beyond
 * this one request (explicit allowlist in buildPublicRequestView).
 */
export default function StatusPage({ params }: PageProps<"/s/[token]">) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-[6vh] pb-16">
      <div className="w-full max-w-[680px]">
        <Suspense fallback={<StatusSkeleton />}>
          <Status params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function Status({ params }: { params: PageProps<"/s/[token]">["params"] }) {
  const { token } = await params;
  const access = await resolveStatusToken(token);
  if (!access) {
    const t = await getTranslations("requests");
    return (
      <div className="rounded-panel border border-border bg-surface shadow-card">
        <EmptyState
          icon={<LinkIcon />}
          title={t("linkInvalidTitle")}
          description={t("linkInvalidBody")}
        />
      </div>
    );
  }
  const view = await buildPublicRequestView(access.intakeItemId, { contactId: access.contactId });
  return <StatusPageClient token={token} view={view} />;
}

function StatusSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-7 shadow-card"
      aria-busy
    >
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-16 w-full rounded-card" />
    </div>
  );
}
