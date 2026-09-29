/**
 * Authorization rules — pure functions, shared by web and worker.
 * The ONLY place permission decisions are made (ARCHITECTURE §7). UI checks
 * use the same functions but only to hide controls; the server enforces.
 */

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
export type ProjectRole = "ADMIN" | "MEMBER" | "GUEST";
export type UserKind = "HUMAN" | "AGENT" | "SYSTEM";

export interface PolicyActor {
  userId: string;
  kind: UserKind;
  workspaceRole: WorkspaceRole;
  canApproveAgentActions?: boolean;
}

export interface PolicyProject {
  visibility: "WORKSPACE" | "PRIVATE";
  guestsCanViewProject: boolean;
  archivedAt?: Date | null;
  /** The actor's ProjectMember role, if any. */
  memberRole: ProjectRole | null;
}

export type WorkspaceAction =
  | "workspace.settings"
  | "workspace.members.manage"
  | "workspace.invite"
  | "workspace.audit.view"
  | "workspace.integrations.manage"
  | "workspace.auth.manage"
  | "project.create"
  | "view.workspace.create"
  | "agent.pause";

const isAdmin = (r: WorkspaceRole) => r === "OWNER" || r === "ADMIN";

export function canWorkspace(actor: PolicyActor, action: WorkspaceAction): boolean {
  if (actor.kind === "SYSTEM") return true;
  switch (action) {
    case "workspace.settings":
    case "workspace.members.manage":
    case "workspace.invite":
    case "workspace.audit.view":
    case "workspace.integrations.manage":
    case "workspace.auth.manage":
    case "agent.pause":
      return actor.kind === "HUMAN" && isAdmin(actor.workspaceRole);
    case "project.create":
    case "view.workspace.create":
      return actor.kind === "HUMAN" && actor.workspaceRole !== "GUEST";
  }
}

/** Effective role inside a project, or null when the actor can't see it at all. */
export function effectiveProjectRole(
  actor: PolicyActor,
  project: PolicyProject,
): ProjectRole | null {
  if (actor.kind === "SYSTEM") return "ADMIN";
  if (isAdmin(actor.workspaceRole)) return "ADMIN";
  if (actor.workspaceRole === "GUEST") return project.memberRole ? "GUEST" : null;
  // Workspace MEMBER (humans and agents)
  if (project.memberRole === "ADMIN") return "ADMIN";
  if (project.memberRole === "MEMBER") return "MEMBER";
  return project.visibility === "WORKSPACE" ? "MEMBER" : null;
}

export type ProjectAction =
  | "project.view" // browse items, views
  | "project.manage" // settings, states, labels, members, forms
  | "project.archive"
  | "workItem.create"
  | "workItem.edit"
  | "workItem.delete"
  | "comment.create"
  | "comment.moderate" // edit/delete others' comments
  | "intake.submit"
  | "intake.triage";

export function canProject(
  actor: PolicyActor,
  project: PolicyProject,
  action: ProjectAction,
): boolean {
  const role = effectiveProjectRole(actor, project);
  if (!role) return false;
  const archived = Boolean(project.archivedAt);
  switch (action) {
    case "project.view":
      return role !== "GUEST" || project.guestsCanViewProject;
    case "intake.submit":
      return !archived; // any role that can see the project may submit
    case "project.manage":
    case "project.archive":
    case "comment.moderate":
      return role === "ADMIN";
    case "workItem.create":
    case "workItem.edit":
    case "workItem.delete":
    case "comment.create":
    case "intake.triage":
      return role !== "GUEST" && !archived;
  }
}

/** Authors may edit/delete their own comments; project admins moderate. */
export function canEditComment(
  actor: PolicyActor,
  project: PolicyProject,
  comment: { authorId: string | null },
): boolean {
  if (comment.authorId && comment.authorId === actor.userId) return true;
  return canProject(actor, project, "comment.moderate");
}

export function canApproveAgentAction(actor: PolicyActor): boolean {
  return (
    actor.kind === "HUMAN" &&
    (isAdmin(actor.workspaceRole) ||
      (actor.workspaceRole === "MEMBER" && Boolean(actor.canApproveAgentActions)))
  );
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
