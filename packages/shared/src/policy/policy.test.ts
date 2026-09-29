import { describe, expect, it } from "vitest";
import {
  canApproveAgentAction,
  canAskAgent,
  canStopAgentRun,
  canEditComment,
  canProject,
  canSeeRequest,
  canView,
  canWorkspace,
  effectiveProjectRole,
  type PolicyActor,
  type PolicyProject,
  type PolicyView,
  type ProjectAction,
  type ProjectRole,
  type WorkspaceRole,
} from "./index";

const actor = (workspaceRole: WorkspaceRole, extra: Partial<PolicyActor> = {}): PolicyActor => ({
  userId: "u1",
  kind: "HUMAN",
  workspaceRole,
  ...extra,
});
const project = (p: Partial<PolicyProject> = {}): PolicyProject => ({
  visibility: "WORKSPACE",
  guestsCanViewProject: false,
  archivedAt: null,
  memberRole: null,
  ...p,
});

describe("workspace actions", () => {
  it.each([
    ["OWNER", true],
    ["ADMIN", true],
    ["MEMBER", false],
    ["GUEST", false],
  ] as const)("%s can manage workspace: %s", (role, expected) => {
    expect(canWorkspace(actor(role), "workspace.settings")).toBe(expected);
    expect(canWorkspace(actor(role), "workspace.invite")).toBe(expected);
    expect(canWorkspace(actor(role), "workspace.audit.view")).toBe(expected);
  });
  it("members create projects, guests don't", () => {
    expect(canWorkspace(actor("MEMBER"), "project.create")).toBe(true);
    expect(canWorkspace(actor("GUEST"), "project.create")).toBe(false);
  });
  it("agents never administer", () => {
    expect(canWorkspace(actor("ADMIN", { kind: "AGENT" }), "workspace.settings")).toBe(false);
    expect(canWorkspace(actor("MEMBER", { kind: "AGENT" }), "project.create")).toBe(false);
  });
});

describe("effective project role", () => {
  const cases: Array<
    [WorkspaceRole, PolicyProject["visibility"], ProjectRole | null, ProjectRole | null]
  > = [
    ["OWNER", "PRIVATE", null, "ADMIN"],
    ["ADMIN", "PRIVATE", null, "ADMIN"],
    ["MEMBER", "WORKSPACE", null, "MEMBER"],
    ["MEMBER", "PRIVATE", null, null],
    ["MEMBER", "PRIVATE", "MEMBER", "MEMBER"],
    ["MEMBER", "WORKSPACE", "ADMIN", "ADMIN"],
    ["GUEST", "WORKSPACE", null, null],
    ["GUEST", "WORKSPACE", "GUEST", "GUEST"],
    ["GUEST", "WORKSPACE", "MEMBER", "GUEST"], // guests are capped at GUEST
  ];
  it.each(cases)(
    "%s on %s project with membership %s → %s",
    (ws, visibility, memberRole, expected) => {
      expect(effectiveProjectRole(actor(ws), project({ visibility, memberRole }))).toBe(expected);
    },
  );
});

describe("project actions matrix", () => {
  const actions: ProjectAction[] = [
    "project.view",
    "project.manage",
    "project.archive",
    "workItem.create",
    "workItem.edit",
    "workItem.delete",
    "comment.create",
    "comment.moderate",
    "intake.submit",
    "intake.triage",
  ];
  const expected: Record<string, ProjectAction[]> = {
    ADMIN: actions,
    MEMBER: [
      "project.view",
      "workItem.create",
      "workItem.edit",
      "workItem.delete",
      "comment.create",
      "intake.submit",
      "intake.triage",
    ],
    GUEST: ["intake.submit"],
    GUEST_VIEW: ["project.view", "intake.submit"],
    NONE: [],
  };
  const scenarios: Array<[string, PolicyActor, PolicyProject]> = [
    ["ADMIN", actor("ADMIN"), project()],
    ["MEMBER", actor("MEMBER"), project()],
    ["GUEST", actor("GUEST"), project({ memberRole: "GUEST" })],
    ["GUEST_VIEW", actor("GUEST"), project({ memberRole: "GUEST", guestsCanViewProject: true })],
    ["NONE", actor("GUEST"), project()],
  ];
  for (const [name, a, p] of scenarios) {
    for (const action of actions) {
      const allowed = expected[name]?.includes(action) ?? false;
      it(`${name} ${allowed ? "can" : "cannot"} ${action}`, () => {
        expect(canProject(a, p, action)).toBe(allowed);
      });
    }
  }
  it("archived projects are read-only except for admins managing them", () => {
    const p = project({ archivedAt: new Date() });
    expect(canProject(actor("MEMBER"), p, "project.view")).toBe(true);
    expect(canProject(actor("MEMBER"), p, "workItem.create")).toBe(false);
    expect(canProject(actor("ADMIN"), p, "project.manage")).toBe(true);
  });
});

describe("comments and approvals", () => {
  it("authors edit their own comments, admins moderate", () => {
    expect(canEditComment(actor("MEMBER"), project(), { authorId: "u1" })).toBe(true);
    expect(canEditComment(actor("MEMBER"), project(), { authorId: "u2" })).toBe(false);
    expect(canEditComment(actor("ADMIN"), project(), { authorId: "u2" })).toBe(true);
  });
  it("approvers: admins and flagged members only", () => {
    expect(canApproveAgentAction(actor("ADMIN"))).toBe(true);
    expect(canApproveAgentAction(actor("MEMBER"))).toBe(false);
    expect(canApproveAgentAction(actor("MEMBER", { canApproveAgentActions: true }))).toBe(true);
    expect(canApproveAgentAction(actor("GUEST", { canApproveAgentActions: true }))).toBe(false);
    expect(canApproveAgentAction(actor("ADMIN", { kind: "AGENT" }))).toBe(false);
  });
});

describe("saved views", () => {
  const view = (o: Partial<PolicyView> = {}): PolicyView => ({
    ownerId: "owner",
    visibility: "WORKSPACE",
    isLocked: false,
    ...o,
  });
  const owner = actor("MEMBER", { userId: "owner" });
  it("private views belong to their owner", () => {
    const v = view({ visibility: "PRIVATE" });
    expect(canView(owner, v, "view.see")).toBe(true);
    expect(canView(actor("MEMBER"), v, "view.see")).toBe(false);
    expect(canView(actor("MEMBER"), v, "view.edit")).toBe(false);
    expect(canView(actor("ADMIN"), v, "view.edit")).toBe(true);
  });
  it("shared views are editable by members until locked", () => {
    expect(canView(actor("MEMBER"), view(), "view.edit")).toBe(true);
    expect(canView(actor("GUEST"), view(), "view.edit")).toBe(false);
    expect(canView(actor("MEMBER"), view({ isLocked: true }), "view.edit")).toBe(false);
    expect(canView(owner, view({ isLocked: true }), "view.edit")).toBe(true);
    expect(canView(actor("ADMIN"), view({ isLocked: true }), "view.edit")).toBe(true);
    expect(canView(actor("MEMBER", { kind: "AGENT" }), view(), "view.edit")).toBe(false);
  });
  it("only owners and admins delete or lock", () => {
    expect(canView(actor("MEMBER"), view(), "view.delete")).toBe(false);
    expect(canView(actor("MEMBER"), view(), "view.lock")).toBe(false);
    expect(canView(owner, view(), "view.delete")).toBe(true);
    expect(canView(actor("ADMIN"), view(), "view.lock")).toBe(true);
  });
});

describe("contacts and requests", () => {
  it("contacts are for the team; merging is for admins", () => {
    expect(canWorkspace(actor("MEMBER"), "contact.view")).toBe(true);
    expect(canWorkspace(actor("MEMBER"), "contact.edit")).toBe(true);
    expect(canWorkspace(actor("GUEST"), "contact.view")).toBe(false);
    expect(canWorkspace(actor("MEMBER"), "contact.merge")).toBe(false);
    expect(canWorkspace(actor("ADMIN"), "contact.merge")).toBe(true);
  });
  it("a guest sees only their own requests, even without browsing rights", () => {
    const guest = actor("GUEST");
    const p = project({ memberRole: "GUEST" });
    expect(canSeeRequest(guest, p, { submitterUserId: "u1" })).toBe(true);
    expect(canSeeRequest(guest, p, { submitterUserId: "u2" })).toBe(false);
    expect(canSeeRequest(guest, p, { submitterUserId: null })).toBe(false);
    // …and not once they've lost access to the project.
    expect(canSeeRequest(guest, project(), { submitterUserId: "u1" })).toBe(false);
  });
  it("triagers see every request", () => {
    expect(canSeeRequest(actor("MEMBER"), project(), { submitterUserId: "u2" })).toBe(true);
    expect(
      canSeeRequest(actor("MEMBER"), project({ archivedAt: new Date() }), {
        submitterUserId: "u2",
      }),
    ).toBe(false);
  });
});

describe("AI teammate", () => {
  it("only human admins manage and pause the agent", () => {
    expect(canWorkspace(actor("ADMIN"), "agent.manage")).toBe(true);
    expect(canWorkspace(actor("MEMBER"), "agent.manage")).toBe(false);
    expect(canWorkspace(actor("ADMIN", { kind: "AGENT" }), "agent.manage")).toBe(false);
    expect(canWorkspace(actor("ADMIN", { kind: "AGENT" }), "agent.pause")).toBe(false);
  });
  it("approvers are admins or members with the flag, never agents or guests", () => {
    expect(canApproveAgentAction(actor("ADMIN"))).toBe(true);
    expect(canApproveAgentAction(actor("MEMBER"))).toBe(false);
    expect(canApproveAgentAction(actor("MEMBER", { canApproveAgentActions: true }))).toBe(true);
    expect(canApproveAgentAction(actor("GUEST", { canApproveAgentActions: true }))).toBe(false);
    expect(
      canApproveAgentAction(actor("ADMIN", { kind: "AGENT", canApproveAgentActions: true })),
    ).toBe(false);
  });
  it("the requester, approvers and admins stop runs", () => {
    expect(canStopAgentRun(actor("MEMBER"), { triggeredById: "u1" })).toBe(true);
    expect(canStopAgentRun(actor("MEMBER"), { triggeredById: "u2" })).toBe(false);
    expect(canStopAgentRun(actor("ADMIN"), { triggeredById: "u2" })).toBe(true);
    expect(canStopAgentRun(actor("GUEST"), { triggeredById: "u1" })).toBe(false);
  });
  it("guests and agents can't ask the agent", () => {
    expect(canAskAgent(actor("MEMBER"))).toBe(true);
    expect(canAskAgent(actor("GUEST"))).toBe(false);
    expect(canAskAgent(actor("MEMBER", { kind: "AGENT" }))).toBe(false);
  });
});
