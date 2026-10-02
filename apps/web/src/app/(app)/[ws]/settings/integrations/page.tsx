import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { listWebhooks } from "@/server/queries/webhooks";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { IntegrationsSettings } from "./integrations-settings";

export const metadata = { title: "Integrations" };

export default function IntegrationsPage({ params }: PageProps<"/[ws]/settings/integrations">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={4} />}>
      <Integrations params={params} />
    </Suspense>
  );
}

async function Integrations({
  params,
}: {
  params: PageProps<"/[ws]/settings/integrations">["params"];
}) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "workspace.integrations.manage")) notFound();
  const [hooks, projects, mailboxes] = await Promise.all([
    listWebhooks(ctx),
    db.project.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null, archivedAt: null },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    // Personal mailboxes never post anywhere (D-138).
    db.mailbox.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null, ownerId: null },
      select: { id: true, emailAddress: true, displayName: true },
      orderBy: { emailAddress: "asc" },
    }),
  ]);
  return (
    <IntegrationsSettings
      ws={ws}
      hooks={hooks}
      projects={projects}
      mailboxes={mailboxes.map((m) => ({ id: m.id, name: m.displayName ?? m.emailAddress }))}
      allowLocal={env.NODE_ENV !== "production"}
    />
  );
}
