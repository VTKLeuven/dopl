import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { listForms } from "@/server/queries/intake";
import { getProjectAccess } from "@/server/queries/projects";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { FormsList } from "@/features/intake/forms-list";

export const metadata = { title: "Forms" };

export default function FormsPage({ params }: PageProps<"/[ws]/p/[ident]/intake/forms">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={1} />
          <RowsSkeleton rows={4} />
        </>
      }
    >
      <Forms params={params} />
    </Suspense>
  );
}

async function Forms({ params }: { params: PageProps<"/[ws]/p/[ident]/intake/forms">["params"] }) {
  const { ws, ident } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const access = await getProjectAccess(ctx, ident);
  if (!access.can("project.manage")) notFound();
  const [forms, project] = await Promise.all([
    listForms(access),
    db.project.findUniqueOrThrow({
      where: { id: access.project.id },
      select: { intakeEnabled: true },
    }),
  ]);
  return (
    <FormsList
      ws={ws}
      project={{
        id: access.project.id,
        identifier: access.project.identifier,
        name: access.project.name,
        color: access.project.color,
      }}
      forms={forms}
      intakeEnabled={project.intakeEnabled}
    />
  );
}
