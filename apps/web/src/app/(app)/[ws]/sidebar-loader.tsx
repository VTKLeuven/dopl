import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { listSidebarProjects } from "@/server/queries/projects";
import { getWorkspaceCtx } from "@/server/session";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";

export async function SidebarLoader({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await getWorkspaceCtx(ws);
  if (!ctx) notFound();
  const projects = await listSidebarProjects(ctx);
  const props = {
    workspace: { slug: ctx.workspace.slug, name: ctx.workspace.name },
    user: { id: ctx.actor.userId, name: ctx.actor.name, email: ctx.actor.email, image: ctx.actor.image },
    projects,
    canCreateProject: canWorkspace(ctx.policyActor, "project.create"),
  };
  return (
    <>
      <Sidebar {...props} />
      <MobileNav {...props} />
    </>
  );
}
