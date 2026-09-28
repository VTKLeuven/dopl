import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canWorkspace } from "@dopl/shared/policy";
import { db } from "@/server/db";
import { requireWorkspaceCtx } from "@/server/session";
import { RowsSkeleton } from "@/components/shell/page-skeletons";
import { MembersView } from "./members-view";

export const metadata = { title: "Members" };

export default function MembersPage({ params }: PageProps<"/[ws]/settings/members">) {
  return (
    <Suspense fallback={<RowsSkeleton rows={8} />}>
      <Members params={params} />
    </Suspense>
  );
}

async function Members({ params }: { params: PageProps<"/[ws]/settings/members">["params"] }) {
  const { ws } = await params;
  const ctx = await requireWorkspaceCtx(ws);
  if (!canWorkspace(ctx.policyActor, "workspace.members.manage")) notFound();
  const [members, invites, projects] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id, user: { kind: "HUMAN" } },
      orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    }),
    db.workspaceInvite.findMany({
      where: { workspaceId: ctx.workspace.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true },
    }),
    db.project.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, identifier: true, color: true },
    }),
  ]);
  return (
    <MembersView
      ws={ws}
      workspaceName={ctx.workspace.name}
      currentUserId={ctx.actor.userId}
      isOwner={ctx.role === "OWNER"}
      members={members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }))}
      invites={invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
      projects={projects}
    />
  );
}
