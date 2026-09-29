import { TodoStatusSchema } from "@dopl/shared/schemas/notes";
import { api } from "@/server/api";
import { listTodos } from "@/server/queries/notes";

/** "My to-dos": checkbox lines across the actor's notes (the NoteTodo projection). */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/[ws]/notes/todos">) {
  const { ws } = await params;
  const url = new URL(req.url);
  const status = TodoStatusSchema.catch("open").parse(url.searchParams.get("status"));
  const limit = Math.min(300, Math.max(1, Number(url.searchParams.get("limit")) || 300));
  return api(ws, (ctx) => listTodos(ctx, status, limit));
}
