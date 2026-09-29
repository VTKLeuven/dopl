import { Suspense } from "react";
import { listTodos } from "@/server/queries/notes";
import { requireWorkspaceCtx } from "@/server/session";
import { Skeleton } from "@/components/ui/skeleton";
import { TodoListSkeleton, TodosView } from "@/features/notes/todos-view";

export const metadata = { title: "My to-dos" };

export default function TodosPage({ params }: PageProps<"/[ws]/notes/todos">) {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8"
          aria-busy
        >
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3.5 w-64" />
          </div>
          <TodoListSkeleton />
        </div>
      }
    >
      <Todos params={params} />
    </Suspense>
  );
}

async function Todos({ params }: { params: PageProps<"/[ws]/notes/todos">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const rows = await listTodos(ctx, "open");
  return (
    <TodosView
      ws={ws}
      me={{ id: ctx.actor.userId, name: ctx.actor.name, image: ctx.actor.image }}
      initial={rows}
      canConvert={ctx.role !== "GUEST"}
    />
  );
}
