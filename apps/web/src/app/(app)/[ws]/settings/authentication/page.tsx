import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { env } from "@/server/env";
import { listSsoProviders } from "@/server/actions/workspace";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { SsoSettings } from "./sso-settings";

export const metadata = { title: "Authentication" };

export default function AuthenticationPage({ params }: PageProps<"/[ws]/settings/authentication">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={4} />}>
      <Authentication params={params} />
    </Suspense>
  );
}

async function Authentication({
  params,
}: {
  params: PageProps<"/[ws]/settings/authentication">["params"];
}) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "workspace.auth.manage")) notFound();
  return (
    <SsoSettings
      ws={ws}
      providers={await listSsoProviders()}
      callbackBase={`${env.BETTER_AUTH_URL}/api/auth/sso/callback/`}
    />
  );
}
