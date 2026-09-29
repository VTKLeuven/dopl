import { Suspense } from "react";
import { listMyRequests, listRequestProjects } from "@/server/queries/intake";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/shell/page-skeletons";
import { MyRequests } from "@/features/intake/my-requests";

export const metadata = { title: "Requests" };

export default function RequestsPage({ params }: PageProps<"/[ws]/requests">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeaderSkeleton actions={1} />
          <RowsSkeleton rows={5} />
        </>
      }
    >
      <Requests params={params} />
    </Suspense>
  );
}

async function Requests({ params }: { params: PageProps<"/[ws]/requests">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const [rows, projects] = await Promise.all([listMyRequests(ctx), listRequestProjects(ctx)]);
  return <MyRequests ws={ws} rows={rows} projects={projects} />;
}
