import { api } from "@/server/api";
import { searchNotes } from "@/server/queries/notes";

/** ⌘K note search (trigram-indexed text match over notes the actor may see). */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/notes/search">) {
  const { ws } = await params;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  return api(ws, (ctx) => searchNotes(ctx, q));
}
