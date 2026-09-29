import { api } from "@/server/api";
import { listThreads } from "@/server/queries/mail";

/** A page of threads: ?mailbox=&view=&q=&cursor= */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/mail/threads">) {
  const { ws } = await params;
  const sp = new URL(req.url).searchParams;
  return api(ws, (ctx) =>
    listThreads(ctx, {
      mailboxId: sp.get("mailbox") || null,
      view: sp.get("view") || undefined,
      q: sp.get("q") || null,
      cursor: sp.get("cursor") || null,
    }),
  );
}
