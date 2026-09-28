import { Suspense } from "react";
import { redirect } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { requireWorkspaceCtx } from "@/server/session";

export default function SettingsIndex({ params }: PageProps<"/[ws]/settings">) {
  return (
    <Suspense>
      <Go params={params} />
    </Suspense>
  );
}

async function Go({ params }: { params: PageProps<"/[ws]/settings">["params"] }): Promise<null> {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  redirect(`/${ws}/settings/${canWorkspace(ctx.policyActor, "workspace.settings") ? "general" : "account"}` as never);
}
