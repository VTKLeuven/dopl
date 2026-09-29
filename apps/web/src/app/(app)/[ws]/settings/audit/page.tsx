import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { auditFacets, listAuditLogs } from "@/server/queries/agent";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { AuditLogView } from "@/features/agent/audit-log";

export const metadata = { title: "Audit log" };

export default function AuditPage({ params }: PageProps<"/[ws]/settings/audit">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={10} />}>
      <Audit params={params} />
    </Suspense>
  );
}

async function Audit({ params }: { params: PageProps<"/[ws]/settings/audit">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "workspace.audit.view")) notFound();
  const [first, facets] = await Promise.all([listAuditLogs(ctx, {}), auditFacets(ctx)]);
  return <AuditLogView ws={ws} initial={first} facets={facets} />;
}
