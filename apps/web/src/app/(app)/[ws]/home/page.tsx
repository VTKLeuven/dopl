import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { House, CircleCheck } from "lucide-react";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shell/page-skeletons";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Home" };

export default function HomePage({ params }: PageProps<"/[ws]/home">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Home params={params} />
    </Suspense>
  );
}

async function Home({ params }: { params: PageProps<"/[ws]/home">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const t = await getTranslations("home");
  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), icon: <House /> }]} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
        <h1 className="text-display font-semibold" data-testid="home-greeting">
          {ctx.actor.name}
        </h1>
        <EmptyState icon={<CircleCheck />} title={t("emptyTitle")} description={t("emptyDescription")} />
      </div>
    </>
  );
}
