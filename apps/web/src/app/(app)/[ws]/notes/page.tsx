import { Suspense } from "react";
import { NotesQuerySchema } from "@dopl/shared/schemas/notes";
import { listNotes } from "@/server/queries/notes";
import { requireWorkspaceCtx } from "@/server/session";
import { Skeleton } from "@/components/ui/skeleton";
import { NotesGridSkeleton, NotesView } from "@/features/notes/notes-view";

export const metadata = { title: "Notes" };

export default function NotesPage({ params, searchParams }: PageProps<"/[ws]/notes">) {
  return (
    <Suspense fallback={<NotesPageSkeleton />}>
      <Notes params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function NotesPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-5 md:px-6" aria-busy>
      <Skeleton className="h-8 w-full max-w-[320px] rounded-chip" />
      <Skeleton className="mx-auto h-12 w-full max-w-[600px] rounded-card" />
      <NotesGridSkeleton />
    </div>
  );
}

async function Notes({
  params,
  searchParams,
}: Pick<PageProps<"/[ws]/notes">, "params" | "searchParams">) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspaceCtx(ws);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const query = NotesQuerySchema.parse({ filter: one(sp.filter), tag: one(sp.tag), q: one(sp.q) });
  const notes = await listNotes(ctx, query);
  return (
    <NotesView
      ws={ws}
      me={{ id: ctx.actor.userId, name: ctx.actor.name, image: ctx.actor.image }}
      initial={{
        params: { filter: query.filter, tag: query.tag || null, q: query.q || null },
        notes,
      }}
    />
  );
}
