import { describe, expect, it } from "vitest";
import { canDashboard, canWorkspace, type PolicyActor, type PolicyDashboard } from "./index";

const actor = (
  userId: string,
  workspaceRole: PolicyActor["workspaceRole"] = "MEMBER",
  kind: PolicyActor["kind"] = "HUMAN",
) => ({ userId, kind, workspaceRole }) as PolicyActor;
const board = (over: Partial<PolicyDashboard> = {}): PolicyDashboard => ({
  ownerId: "owner",
  visibility: "PRIVATE",
  ...over,
});

describe("analytics and dashboard policy", () => {
  it("analytics are for members, not guests or agents", () => {
    expect(canWorkspace(actor("m"), "analytics.view")).toBe(true);
    expect(canWorkspace(actor("g", "GUEST"), "analytics.view")).toBe(false);
    expect(canWorkspace(actor("a", "MEMBER", "AGENT"), "analytics.view")).toBe(false);
  });

  it("private dashboards are the owner's, even for admins", () => {
    expect(canDashboard(actor("owner"), board(), "dashboard.view")).toBe(true);
    expect(canDashboard(actor("other"), board(), "dashboard.view")).toBe(false);
    expect(canDashboard(actor("admin", "ADMIN"), board(), "dashboard.view")).toBe(false);
    expect(canDashboard(actor("admin", "ADMIN"), board(), "dashboard.delete")).toBe(false);
  });

  it("shared dashboards are read-only for others; admins may delete them", () => {
    const shared = board({ visibility: "WORKSPACE" });
    expect(canDashboard(actor("other"), shared, "dashboard.view")).toBe(true);
    expect(canDashboard(actor("other"), shared, "dashboard.edit")).toBe(false);
    expect(canDashboard(actor("other"), shared, "dashboard.delete")).toBe(false);
    expect(canDashboard(actor("admin", "OWNER"), shared, "dashboard.edit")).toBe(false);
    expect(canDashboard(actor("admin", "OWNER"), shared, "dashboard.delete")).toBe(true);
    expect(canDashboard(actor("owner"), shared, "dashboard.edit")).toBe(true);
  });

  it("guests never see dashboards, even shared ones or their own", () => {
    expect(
      canDashboard(actor("g", "GUEST"), board({ visibility: "WORKSPACE" }), "dashboard.view"),
    ).toBe(false);
    expect(canDashboard(actor("owner", "GUEST"), board(), "dashboard.view")).toBe(false);
  });
});
