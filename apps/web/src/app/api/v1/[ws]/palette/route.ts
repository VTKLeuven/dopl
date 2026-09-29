import { api } from "@/server/api";
import { getPaletteData } from "@/server/queries/palette";

export async function GET(_req: Request, { params }: RouteContext<"/api/v1/[ws]/palette">) {
  const { ws } = await params;
  return api(ws, getPaletteData);
}
