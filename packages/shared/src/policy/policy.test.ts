import { describe, expect, it } from "vitest";
import {
  canApproveAgentAction,
  canEditComment,
  canProject,
  canWorkspace,
  effectiveProjectRole,
  type PolicyActor,
  type PolicyProject,
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
