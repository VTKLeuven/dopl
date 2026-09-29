import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { env } from "@/server/env";
import { getAgentSettings } from "@/server/queries/agent";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { AgentSettingsView } from "@/features/agent/settings/agent-settings";

export const metadata = { title: "AI teammate" };

export default function AgentSettingsPage({ params }: PageProps<"/[ws]/settings/agent">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={6} />}>
      <AgentSettings params={params} />
    </Suspense>
  );
}

async function AgentSettings({ params }: { params: PageProps<"/[ws]/settings/agent">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "agent.manage")) notFound();
  const settings = await getAgentSettings(ctx);
  return <AgentSettingsView ws={ws} settings={settings} appUrl={env.APP_URL} />;
}
