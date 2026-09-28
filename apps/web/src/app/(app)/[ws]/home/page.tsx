import { Suspense } from "react";
import { requireWorkspaceCtx } from "@/server/session";

export default function HomePage({ params }: PageProps<"/[ws]/home">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Home params={params} />
    </Suspense>
  );
}

async function Home({ params }: { params: PageProps<"/[ws]/home">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  return <p data-testid="home-greeting">{ctx.actor.name} · {ctx.workspace.name} · {ctx.role}</p>;
}
