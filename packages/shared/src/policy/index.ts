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

export interface PolicyView {
  ownerId: string;
  visibility: "PRIVATE" | "WORKSPACE";
  isLocked: boolean;
}

/**
 * Saved views. Seeing one also needs access to its project (checked by the
 * caller). Private views are the owner's alone. Shared views can be changed by
 * any non-guest human unless the owner or an admin locked them.
 */
export type ViewAction = "view.see" | "view.edit" | "view.delete" | "view.lock";

export function canView(actor: PolicyActor, view: PolicyView, action: ViewAction): boolean {
  if (actor.kind === "SYSTEM") return true;
  const owner = view.ownerId === actor.userId;
  const admin = actor.kind === "HUMAN" && isAdmin(actor.workspaceRole);
  switch (action) {
    case "view.see":
      return owner || view.visibility === "WORKSPACE";
    case "view.edit":
      if (owner || admin) return true;
      return (
        view.visibility === "WORKSPACE" &&
        !view.isLocked &&
        actor.kind === "HUMAN" &&
        actor.workspaceRole !== "GUEST"
      );
    case "view.delete":
    case "view.lock":
      return owner || admin;
  }
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

/* ───────────────────────── notes (Phase 5) ───────────────────────── */

export interface PolicyNote {
  ownerId: string;
  visibility: "PRIVATE" | "WORKSPACE";
  archived: boolean;
  deleted: boolean;
  /**
   * True when the note is attached to a project (directly or through a work
   * item) that the actor can browse. The caller resolves project access.
   */
  attachedProjectVisible: boolean;
}

export type NoteAction =
  | "note.view"
  | "note.edit" // content, colour, pin, to-dos, archive, trash
  | "note.share" // private / team / project / work item
  | "note.convert"; // turn the note or one of its lines into a work item

/**
 * DATA_MODEL §3.5: a note is its owner's. Others see it only when it is
 * shared with the team or attached to a project/work item they can browse,
 * and never once it's archived or in the trash. Guests only ever see their
 * own notes, and admins get no special access to private notes. Only the
 * owner changes a note; shared notes are read-only for everyone else.
 */
export function canNote(actor: PolicyActor, note: PolicyNote, action: NoteAction): boolean {
  const owner = note.ownerId === actor.userId;
  const guest = actor.workspaceRole === "GUEST";
  switch (action) {
    case "note.view":
      if (owner) return true;
      if (guest || note.archived || note.deleted) return false;
      return note.visibility === "WORKSPACE" || note.attachedProjectVisible;
    case "note.edit":
      return owner;
    case "note.share":
    case "note.convert":
      return owner && !guest && actor.kind !== "SYSTEM";
  }
}
