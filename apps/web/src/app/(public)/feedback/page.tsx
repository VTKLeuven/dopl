import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChevronRight, MessageSquareText } from "lucide-react";
import { getFeedbackPage } from "@/server/queries/public-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DoplMark } from "@/components/icons/dopl-logo";
import { ProjectBadge } from "@/components/shell/project-badge";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Feedback", robots: { index: false, follow: false } };

/**
 * One address for every project's feedback (D-139): the published forms whose
 * settings put them here, each linking to its own /f/<slug>.
 */
export default function FeedbackPage() {
  return (
    <div className="flex min-h-dvh items-start justify-center px-4 pt-[8vh] pb-16">
      <div className="w-full overflow-hidden rounded-panel border border-border bg-surface shadow-card sm:max-w-[560px]">
        <Suspense fallback={<FeedbackSkeleton />}>
          <FeedbackForms />
        </Suspense>
      </div>
    </div>
  );
}

async function FeedbackForms() {
  // The list comes from the database: render it per request (from the cache),
  // never at build time.
  await connection();
  const [t, { workspaceName, forms }] = await Promise.all([
    getTranslations("feedbackPage"),
    getFeedbackPage(),
  ]);
  return (
    <>
      <header className="flex flex-col gap-1.5 p-7 pb-5">
        <div className="flex items-center gap-2 text-small font-medium text-fg-muted">
          <DoplMark size={18} />
          {workspaceName ? <span className="truncate">{workspaceName}</span> : null}
        </div>
        <h1 className="text-title-lg font-semibold tracking-[-0.012em] text-fg">{t("title")}</h1>
        {forms.length ? <p className="text-body text-fg-secondary">{t("intro")}</p> : null}
      </header>
      {forms.length === 0 ? (
        <EmptyState
          className="border-t border-border"
          compact
          icon={<MessageSquareText />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="border-t border-border" data-testid="feedback-forms">
          {forms.map((f) => (
            <li key={f.slug} className="border-b border-border last:border-b-0">
              <Link
                href={`/f/${f.slug}`}
                className="group flex items-center gap-3.5 px-7 py-3.5 focus-ring transition-colors hover:bg-surface-hover"
                data-testid="feedback-form"
              >
                <ProjectBadge
                  name={f.project.name}
                  color={f.project.color}
                  size={32}
                  className="rounded-chip"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-semibold text-fg">{f.project.name}</span>
                  <span className="truncate text-small text-fg-secondary">{f.title}</span>
                  {f.description ? (
                    <span className="mt-0.5 line-clamp-2 text-small text-fg-muted">
                      {f.description}
                    </span>
                  ) : null}
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-icon transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Same line boxes as the loaded page, so nothing moves when it streams in. */
function FeedbackSkeleton() {
  return (
    <div aria-busy>
      <div className="flex flex-col gap-1.5 p-7 pb-5">
        <SkeletonLine height="h-4.5" className="h-3 w-24" />
        <SkeletonLine height="h-7" className="h-5 w-32" />
        <SkeletonLine height="h-5" className="h-3.5 w-2/3" />
      </div>
      <div className="border-t border-border">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3.5 border-b border-border px-7 py-3.5 last:border-b-0"
          >
            <Skeleton className="size-8 rounded-chip" />
            <div className="flex flex-1 flex-col">
              <SkeletonLine height="h-5" className="h-3.5 w-28" />
              <SkeletonLine height="h-4.5" className="h-3 w-44" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonLine({ height, className }: { height: string; className: string }) {
  return (
    <div className={cn("flex items-center", height)}>
      <Skeleton className={className} />
    </div>
  );
}
