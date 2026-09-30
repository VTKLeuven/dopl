import { notFound } from "next/navigation";
import { canMailbox, canWorkspace } from "@dopl/shared/policy";
import { listSidebarProjects } from "@/server/queries/projects";
import { triageProjectIds } from "@/server/queries/intake";
import { readableMailboxIds } from "@/server/queries/mail";
import { listFavoriteViews } from "@/server/queries/views";
import { getWorkspaceCtx } from "@/server/session";
import { findAgent } from "@/server/agent/runs";
import { db } from "@/server/db";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";

export async function SidebarLoader({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await getWorkspaceCtx(ws);
  if (!ctx) notFound();
  const [projects, favorites, intakePending, mailboxes, agent] = await Promise.all([
    listSidebarProjects(ctx),
    listFavoriteViews(ctx),
    triageProjectIds(ctx),
    readableMailboxIds(ctx),
    ctx.role === "GUEST" ? null : findAgent(db, ctx.workspace.id),
  ]);
  const props = {
    workspace: { slug: ctx.workspace.slug, name: ctx.workspace.name },
    user: {
      id: ctx.actor.userId,
      name: ctx.actor.name,
      email: ctx.actor.email,
      image: ctx.actor.image,
    },
    projects,
    favorites,
    canCreateProject: canWorkspace(ctx.policyActor, "project.create"),
    intakePending,
    showRequests: ctx.role === "GUEST",
    showContacts: canWorkspace(ctx.policyActor, "contact.view"),
    showAnalytics: canWorkspace(ctx.policyActor, "analytics.view"),
    // Mail: anyone who can read a mailbox, and admins (who connect them).
    showMail:
      mailboxes.length > 0 || canMailbox(ctx.policyActor, { isMember: false }, "mailbox.manage"),
    canChat: ctx.role !== "GUEST",
    agent: agent ? { name: agent.name, image: agent.image } : null,
  };
  return (
    <>
      <Sidebar {...props} />
      <MobileNav {...props} />
    </>
  );
}
