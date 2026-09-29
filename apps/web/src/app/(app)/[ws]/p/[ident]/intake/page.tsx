import { Suspense } from "react";
import { notFound } from "next/navigation";
import { IntakeTabSchema } from "@dopl/shared/schemas/intake";
import { countIntake, listIntake } from "@/server/queries/intake";
import { getProjectAccess } from "@/server/queries/projects";
import { getProjectMeta } from "@/server/queries/work-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { IntakeView } from "@/features/intake/intake-view";

export const metadata = { title: "Intake" };

export default function IntakePage({ params, searchParams }: PageProps<"/[ws]/p/[ident]/intake">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={1} />
          <div className="h-[var(--toolbar-height)] border-b border-border" />
          <RowsSkeleton rows={8} />
        </>
      }
    >
      <Intake params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Intake({
  params,
  searchParams,
}: Pick<PageProps<"/[ws]/p/[ident]/intake">, "params" | "searchParams">) {
  const [{ ws, ident }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireWorkspaceCtx(ws);
  const access = await getProjectAccess(ctx, ident);
  if (!access.can("intake.triage")) notFound();
  const tab = IntakeTabSchema.catch("pending").parse(sp.tab);
  const [rows, counts, meta] = await Promise.all([
    listIntake(access, tab),
    countIntake(access),
    getProjectMeta(ctx, access),
  ]);
  return (
    <IntakeView
      ws={ws}
      project={{
        id: access.project.id,
        identifier: access.project.identifier,
        name: access.project.name,
        color: access.project.color,
      }}
      initialTab={tab}
      initial={{ rows, counts }}
      initialMeta={meta}
      canManage={access.can("project.manage")}
    />
  );
}
