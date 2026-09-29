import { Suspense } from "react";
import { notFound } from "next/navigation";
import { env, turnstileEnabled } from "@/server/env";
import { getFormForEdit } from "@/server/queries/intake";
import { getProjectAccess } from "@/server/queries/projects";
import { getProjectMeta } from "@/server/queries/work-items";
import { requireWorkspaceCtx } from "@/server/session";
import { PageSkeleton } from "@/components/shell/page-skeletons";
import { FormBuilder } from "@/features/intake/form-builder";

export const metadata = { title: "Form builder" };

export default function FormBuilderPage({
  params,
}: PageProps<"/[ws]/p/[ident]/intake/forms/[formId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Builder params={params} />
    </Suspense>
  );
}

async function Builder({
  params,
}: {
  params: PageProps<"/[ws]/p/[ident]/intake/forms/[formId]">["params"];
}) {
  const { ws, ident, formId } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const access = await getProjectAccess(ctx, ident);
  if (!access.can("project.manage")) notFound();
  const form = await getFormForEdit(access, formId).catch(() => notFound());
  const meta = await getProjectMeta(ctx, access);
  return (
    <FormBuilder
      key={form.id}
      ws={ws}
      appOrigin={new URL(env.APP_URL).origin}
      project={{
        id: access.project.id,
        identifier: access.project.identifier,
        name: access.project.name,
        color: access.project.color,
      }}
      form={form}
      meta={meta}
      workspaceName={ctx.workspace.name}
      turnstileAvailable={turnstileEnabled}
    />
  );
}
