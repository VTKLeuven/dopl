import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { canWorkspace } from "@dopl/shared/policy";
import { FolderKanban } from "lucide-react";
import { db } from "@/server/db";
import { accessibleProjectsWhere } from "@/server/queries/projects";
import { requireWorkspaceCtx } from "@/server/session";
import { PageSkeleton } from "@/components/shell/page-skeletons";
import { ProjectsView } from "./projects-view";

export const metadata = { title: "Projects" };

export default function ProjectsPage({ params }: PageProps<"/[ws]/projects">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Projects params={params} />
    </Suspense>
  );
}

async function Projects({ params }: { params: PageProps<"/[ws]/projects">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const t = await getTranslations("projects");
  const projects = await db.project.findMany({
    where: accessibleProjectsWhere(ctx),
    orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { name: "asc" }],
    select: {
      id: true,
      identifier: true,
      name: true,
      color: true,
      visibility: true,
      archivedAt: true,
      updatedAt: true,
      lead: { select: { id: true, name: true, image: true } },
      _count: { select: { members: true, workItems: { where: { deletedAt: null, archivedAt: null, stateGroup: { in: ["BACKLOG", "UNSTARTED", "STARTED"] } } } } },
    },
  });
  return (
    <ProjectsView
      ws={ws}
      title={t("title")}
      icon={<FolderKanban />}
      canCreate={canWorkspace(ctx.policyActor, "project.create")}
      projects={projects.map((p) => ({
        id: p.id,
        identifier: p.identifier,
        name: p.name,
        color: p.color,
        private: p.visibility === "PRIVATE",
        archived: Boolean(p.archivedAt),
        updatedAt: p.updatedAt.toISOString(),
        lead: p.lead,
        members: p._count.members,
        open: p._count.workItems,
      }))}
    />
  );
}
