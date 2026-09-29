import { Suspense } from "react";
import { getNotesSummary, listTags } from "@/server/queries/notes";
import { requireWorkspaceCtx } from "@/server/session";
import { PageHeaderSkeleton } from "@/components/shell/page-skeletons";
import { NotesHeader } from "@/features/notes/notes-header";
import { NotesSidebar, NotesSidebarSkeleton } from "@/features/notes/notes-sidebar";

/**
 * Notes (PROMPT §4.6): the header, a secondary column with filters, to-dos,
 * the daily review and the tag tree, and the page on the right.
 */
export default function NotesLayout({ children, params }: LayoutProps<"/[ws]/notes">) {
  return (
    <>
      <Suspense fallback={<PageHeaderSkeleton actions={1} />}>
        <Header params={params} />
      </Suspense>
      <div className="flex min-h-0 flex-1">
        <Suspense fallback={<NotesSidebarSkeleton />}>
          <Sidebar params={params} />
        </Suspense>
        <div className="min-h-0 min-w-0 flex-1 scrollbar-thin overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

async function Header({ params }: { params: LayoutProps<"/[ws]/notes">["params"] }) {
  const { ws } = await params;
  return <NotesHeader ws={ws} />;
}

async function Sidebar({ params }: { params: LayoutProps<"/[ws]/notes">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const [summary, tags] = await Promise.all([getNotesSummary(ctx), listTags(ctx)]);
  return <NotesSidebar ws={ws} initialSummary={summary} initialTags={tags} />;
}
