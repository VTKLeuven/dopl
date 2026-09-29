import { Suspense } from "react";
import { getReview } from "@/server/queries/notes";
import { requireWorkspaceCtx } from "@/server/session";
import { ReviewSkeleton, ReviewView } from "@/features/notes/review-view";

export const metadata = { title: "Daily review" };

export default function ReviewPage({ params }: PageProps<"/[ws]/notes/review">) {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <Review params={params} />
    </Suspense>
  );
}

async function Review({ params }: { params: PageProps<"/[ws]/notes/review">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const review = await getReview(ctx);
  return (
    <ReviewView
      ws={ws}
      me={{ id: ctx.actor.userId, name: ctx.actor.name, image: ctx.actor.image }}
      initial={review}
      canConvert={ctx.role !== "GUEST"}
    />
  );
}
