import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getProjectAccess } from "@/server/queries/projects";
import { requireWorkspaceCtx } from "@/server/session";
import { PageSkeleton } from "@/components/shell/page-skeletons";
import { ProjectSettings } from "./project-settings";

export const metadata = { title: "Project settings" };

export default function ProjectSettingsPage({ params }: PageProps<"/[ws]/p/[ident]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: { params: PageProps<"/[ws]/p/[ident]/settings">["params"] }) {
  const { ws, ident } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  const access = await getProjectAccess(ctx, ident);
  if (!access.can("project.manage")) notFound();
  const projectId = access.project.id;
  const [states, labels, members, workspaceMembers] = await Promise.all([
    db.workflowState.findMany({ where: { projectId, group: { not: "TRIAGE" } }, orderBy: { sortKey: "asc" }, select: { id: true, name: true, group: true, color: true, isDefault: true, _count: { select: { workItems: { where: { deletedAt: null } } } } } }),
    db.label.findMany({ where: { projectId }, orderBy: { sortKey: "asc" }, select: { id: true, name: true, color: true, _count: { select: { workItems: true } } } }),
    db.projectMember.findMany({ where: { projectId }, select: { role: true, user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { user: { name: "asc" } } }),
    db.workspaceMember.findMany({ where: { workspaceId: ctx.workspace.id, status: "ACTIVE", user: { kind: "HUMAN" } }, select: { role: true, user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { user: { name: "asc" } } }),
  ]);
  return (
    <ProjectSettings
      ws={ws}
      project={{ ...access.project, archivedAt: access.project.archivedAt?.toISOString() ?? null }}
      states={states.map((s) => ({ ...s, count: s._count.workItems }))}
      labels={labels.map((l) => ({ ...l, count: l._count.workItems }))}
      members={members.map((m) => ({ ...m.user, role: m.role }))}
      candidates={workspaceMembers.map((m) => ({ ...m.user, workspaceRole: m.role }))}
    />
  );
}
