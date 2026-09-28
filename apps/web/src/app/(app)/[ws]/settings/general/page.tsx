import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { GeneralForm } from "./general-form";

export const metadata = { title: "Workspace settings" };

export default function GeneralPage({ params }: PageProps<"/[ws]/settings/general">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={4} />}>
      <General params={params} />
    </Suspense>
  );
}

async function General({ params }: { params: PageProps<"/[ws]/settings/general">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "workspace.settings")) notFound();
  return <GeneralForm ws={ws} name={ctx.workspace.name} timezone={ctx.workspace.timezone} slug={ctx.workspace.slug} />;
}
