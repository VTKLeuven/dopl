import { api } from "@/server/api";
import { runMetric } from "@/server/queries/analytics";

/**
 * One chart's data. `?q=` carries the query as JSON (spec, range, project);
 * it's validated by the metric registry, and the rows are scoped to what the
 * reader can see.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/analytics/query">) {
  const { ws } = await params;
  let query: unknown;
  try {
    query = JSON.parse(new URL(req.url).searchParams.get("q") ?? "{}");
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  return api(ws, (ctx) => runMetric(ctx, query));
}
