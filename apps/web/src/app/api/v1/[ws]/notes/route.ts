import { NotesQuerySchema } from "@dopl/shared/schemas/notes";
import { api } from "@/server/api";
import { listNotes } from "@/server/queries/notes";

/** The notes grid (filter, tag, search) and the notes attached to a work item (`?item=`). */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/notes">) {
  const { ws } = await params;
  const query = NotesQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return api(ws, (ctx) => listNotes(ctx, query));
}
