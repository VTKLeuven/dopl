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
  | "contact.view"
  | "contact.edit"
  | "contact.merge"
  | "agent.pause"
  | "analytics.view";

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
    case "contact.merge":
    case "agent.pause":
      return actor.kind === "HUMAN" && isAdmin(actor.workspaceRole);
    // Contacts are people outside the team: never visible to guests.
    // Analytics count across projects; guests only ever see their own requests.
    case "analytics.view":
    case "contact.view":
    case "contact.edit":
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

/**
 * A request someone submitted from inside Dopl (guest or member). Its
 * submitter may always follow it and reply publicly, even as a guest who
 * can't browse the project; everyone else needs triage rights.
 */
export function canSeeRequest(
  actor: PolicyActor,
  project: PolicyProject,
  request: { submitterUserId: string | null },
): boolean {
  if (request.submitterUserId && request.submitterUserId === actor.userId)
    return effectiveProjectRole(actor, project) !== null;
  return canProject(actor, project, "intake.triage");
}

/**
 * Team chat (Phase 4). Messages are for the team: guests never see channels
 * or DMs. Project channels follow project access; custom channels are open to
 * every non-guest member when public and to their members when private; DMs
 * belong to their participants. Admins get no backdoor into private channels.
 */
export interface PolicyChannel {
  kind: "PROJECT" | "CUSTOM" | "DM" | "GROUP_DM";
  isPrivate: boolean;
  archivedAt?: Date | null;
  /** The actor's ChannelMember role, if they have a row. */
  memberRole: "OWNER" | "MEMBER" | null;
  /** PROJECT channels: the project, with the actor's project membership. */
  project?: PolicyProject | null;
}

export type ChannelAction =
  | "channel.view" // read messages, get realtime events
  | "channel.post" // send messages and replies (posting in a public channel joins it)
  | "channel.join"
  | "channel.leave"
  | "channel.members" // add people
  | "channel.manage"; // rename, topic, archive, remove people

export function canChannel(
  actor: PolicyActor,
  channel: PolicyChannel,
  action: ChannelAction,
): boolean {
  if (actor.kind === "SYSTEM") return true;
  if (actor.workspaceRole === "GUEST") return false;
  const member = channel.memberRole !== null;
  const archived = Boolean(channel.archivedAt);
  if (channel.kind === "PROJECT") {
    const role = channel.project ? effectiveProjectRole(actor, channel.project) : null;
    const inProject = role === "ADMIN" || role === "MEMBER";
    switch (action) {
      case "channel.view":
      case "channel.join":
        return inProject;
      case "channel.post":
        return inProject && !archived && !channel.project?.archivedAt;
      case "channel.manage":
        return role === "ADMIN";
      case "channel.leave":
      case "channel.members":
        return false; // membership follows the project
    }
  }
  if (channel.kind === "CUSTOM") {
    const visible = member || !channel.isPrivate;
    switch (action) {
      case "channel.view":
        return visible;
      case "channel.join":
        return !member && !channel.isPrivate && !archived;
      case "channel.post":
        return visible && !archived;
      case "channel.leave":
        return member;
      case "channel.members":
        return member && !archived;
      case "channel.manage":
        return (
          channel.memberRole === "OWNER" ||
          (visible && actor.kind === "HUMAN" && isAdmin(actor.workspaceRole))
        );
    }
  }
  // DM and GROUP_DM: participants only; a different group means a new DM.
  switch (action) {
    case "channel.view":
    case "channel.post":
      return member;
    default:
      return false;
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

/* ───────────────────────── dashboards (Phase 6) ───────────────────────── */

export interface PolicyDashboard {
  ownerId: string;
  visibility: "PRIVATE" | "WORKSPACE";
}

export type DashboardAction =
  | "dashboard.view"
  | "dashboard.edit" // name, sharing, widgets, layout
  | "dashboard.delete";

/**
 * A dashboard is its owner's; shared ones are readable by every member (not
 * guests). The charts on it are still computed with the reader's own project
 * access, so sharing a dashboard never shares data. Admins may delete shared
 * dashboards (clean-up), not edit them.
 */
export function canDashboard(
  actor: PolicyActor,
  dashboard: PolicyDashboard,
  action: DashboardAction,
): boolean {
  if (actor.kind !== "HUMAN" || actor.workspaceRole === "GUEST") return false;
  const owner = dashboard.ownerId === actor.userId;
  switch (action) {
    case "dashboard.view":
      return owner || dashboard.visibility === "WORKSPACE";
    case "dashboard.edit":
      return owner;
    case "dashboard.delete":
      return owner || (dashboard.visibility === "WORKSPACE" && isAdmin(actor.workspaceRole));
  }
}
