import { isUuid } from "@dopl/shared/ids";
import { api } from "@/server/api";
import { NotFoundError } from "@/server/action-result";
import { getNote } from "@/server/queries/notes";

/** One note the actor may see (the note dialog, ⌘K results, item notes). */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/notes/[id]">) {
  const { ws, id } = await params;
  return api(ws, (ctx) => {
    if (!isUuid(id)) throw new NotFoundError();
    return getNote(ctx, id);
  });
}
