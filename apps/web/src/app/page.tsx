import { Suspense } from "react";
import { redirect } from "next/navigation";
import { defaultWorkspaceSlug, getActor } from "@/server/session";

/** "/" → the user's workspace, or sign-in. */
export default function RootPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-canvas" />}>
      <RootRedirect />
    </Suspense>
  );
}

async function RootRedirect(): Promise<null> {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  const slug = await defaultWorkspaceSlug(actor.userId);
  if (!slug) redirect("/sign-in");
  redirect(`/${slug}/home` as never);
}
