import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getMyRequest } from "@/server/queries/intake";
import { requireWorkspaceCtx } from "@/server/session";
import { PageSkeleton } from "@/components/shell/page-skeletons";
import { MyRequest } from "@/features/intake/my-request";

export const metadata = { title: "Request" };

export default function RequestPage({ params }: PageProps<"/[ws]/requests/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Request params={params} />
    </Suspense>
  );
}

async function Request({ params }: { params: PageProps<"/[ws]/requests/[id]">["params"] }) {
  const { ws, id } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const view = await getMyRequest(ctx, id).catch(() => notFound());
  return <MyRequest ws={ws} view={view} />;
}
