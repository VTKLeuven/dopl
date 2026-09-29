import { Suspense } from "react";
import { notFound } from "next/navigation";
import { listAgentActivity } from "@/server/queries/agent";
import { requireWorkspaceCtx } from "@/server/session";
import { AgentSkeleton, AgentView } from "@/features/agent/agent-view";

export const metadata = { title: "Dopl" };

/** The AI teammate: approvals waiting for someone, recent runs, the Pause switch (Phase 8). */
export default function AgentPage({ params }: PageProps<"/[ws]/agent">) {
  return (
    <Suspense fallback={<AgentSkeleton />}>
      <Agent params={params} />
    </Suspense>
  );
}

async function Agent({ params }: Pick<PageProps<"/[ws]/agent">, "params">) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (ctx.role === "GUEST") notFound();
  const activity = await listAgentActivity(ctx);
  return <AgentView ws={ws} initial={activity} />;
}
