import { Suspense } from "react";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/action-result";
import { getAgentRun } from "@/server/queries/agent";
import { requireWorkspaceCtx } from "@/server/session";
import { agentKeys } from "@/features/agent/data";
import { AgentSkeleton } from "@/features/agent/agent-view";
import { RunPage } from "@/features/agent/run-page";

export const metadata = { title: "Agent run" };

export default function AgentRunPage({ params }: PageProps<"/[ws]/agent/runs/[id]">) {
  return (
    <Suspense fallback={<AgentSkeleton />}>
      <Run params={params} />
    </Suspense>
  );
}

async function Run({ params }: Pick<PageProps<"/[ws]/agent/runs/[id]">, "params">) {
  const { ws, id } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const run = await getAgentRun(ctx, id).catch((err: unknown) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const qc = new QueryClient();
  qc.setQueryData(agentKeys.run(ws, id), run);
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <RunPage ws={ws} run={run} />
    </HydrationBoundary>
  );
}
