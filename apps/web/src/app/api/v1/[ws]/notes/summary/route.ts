import { api } from "@/server/api";
import { getNotesSummary } from "@/server/queries/notes";

/** Counts for the notes sidebar: filters, open to-dos, review left today. */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/notes/summary">) {
  const { ws } = await params;
  return api(ws, getNotesSummary);
}
