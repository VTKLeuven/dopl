import { Suspense } from "react";
import { Settings } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { canWorkspace } from "@dopl/shared/policy";
import { getWorkspaceCtx } from "@/server/session";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children, params }: LayoutProps<"/[ws]/settings">) {
  const t = await getTranslations("settings");
  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), icon: <Settings /> }]} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Suspense fallback={<div className="md:w-56 md:border-r md:border-border" />}>
          <Nav params={params} />
        </Suspense>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

async function Nav({ params }: { params: LayoutProps<"/[ws]/settings">["params"] }) {
  const { ws } = await params;
  const ctx = await getWorkspaceCtx(ws);
  return <SettingsNav ws={ws} isAdmin={ctx ? canWorkspace(ctx.policyActor, "workspace.settings") : false} />;
}
