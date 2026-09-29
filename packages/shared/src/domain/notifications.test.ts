import { describe, expect, it } from "vitest";
import { CreateChannelSchema, channelSlug, dmKey } from "../schemas/messages";
import { INBOX_FILTERS, filterOfType, NOTIFICATION_TYPES } from "../schemas/inbox";
import { digestLine, notificationPath, type NotificationTarget } from "./notifications";

const target = (t: Partial<NotificationTarget>): NotificationTarget => ({
  type: "MENTION",
  entityType: "WORK_ITEM",
  entityId: "e1",
  workItemId: null,
  messageId: null,
  data: {},
  ...t,
});

describe("notification links", () => {
  it("work items open by identifier, requests in triage by id", () => {
    expect(notificationPath("vtk", target({ workItemId: "w1", identifier: "INFRA-4" }))).toBe(
      "/vtk/i/INFRA-4",
    );
    expect(notificationPath("vtk", target({ workItemId: "w1" }))).toBe("/vtk/i/w1");
  });
  it("chat notifications open the message or its thread", () => {
    const base = { messageId: "m1", entityType: "MESSAGE" };
    expect(notificationPath("vtk", target({ ...base, data: { channelId: "c1" } }))).toBe(
      "/vtk/messages/c/c1?msg=m1",
    );
    expect(
      notificationPath(
        "vtk",
        target({ ...base, type: "THREAD_REPLY", data: { channelId: "c1", threadRootId: "r1" } }),
      ),
    ).toBe("/vtk/messages/c/c1?thread=r1");
  });
  it("requests go to the triage peek for the team and the request page for submitters", () => {
    expect(
      notificationPath(
        "vtk",
        target({
          type: "INTAKE_SUBMITTED",
          entityType: "INTAKE_ITEM",
          entityId: "i1",
          workItemId: "w1",
          data: { projectIdentifier: "HELP" },
        }),
      ),
    ).toBe("/vtk/p/HELP/intake?peek=i1");
    expect(
      notificationPath(
        "vtk",
        target({
          type: "INTAKE_UPDATED",
          entityType: "INTAKE_ITEM",
          entityId: "i1",
          workItemId: "w1",
        }),
      ),
    ).toBe("/vtk/requests/i1");
    expect(notificationPath("vtk", target({ type: "INTEGRATION_FAILED" }))).toBe(
      "/vtk/settings/integrations",
    );
  });
  it("digest lines read naturally", () => {
    expect(
      digestLine({
        type: "WORK_ITEM_UPDATED",
        actorName: "Ann",
        data: { identifier: "NET-3", title: "Swap switch", to: "Done", count: 3 },
      }),
    ).toEqual({ headline: "Ann moved NET-3 to Done (3 updates)", detail: "Swap switch" });
    expect(
      digestLine({
        type: "MENTION",
        actorName: null,
        data: { channelName: "general", excerpt: "@Bram lunch?" },
      }),
    ).toEqual({ headline: "Someone mentioned you in #general", detail: "@Bram lunch?" });
    for (const type of NOTIFICATION_TYPES)
      expect(digestLine({ type, actorName: "Ann", data: {} }).headline.length).toBeGreaterThan(0);
  });
});

describe("inbox filters", () => {
  it("partition the notification types", () => {
    const seen = Object.values(INBOX_FILTERS).flat();
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(NOTIFICATION_TYPES.length);
    expect(filterOfType("THREAD_REPLY")).toBe("comments");
    expect(filterOfType("MENTION")).toBe("mentions");
  });
});

describe("channel names", () => {
  it("slugs are lowercase and url-safe", () => {
    expect(channelSlug("Release Planning!")).toBe("release-planning");
    expect(channelSlug("  Café  Ops ")).toBe("cafe-ops");
    expect(channelSlug("infra_alerts")).toBe("infra_alerts");
    expect(CreateChannelSchema.safeParse({ name: "!!!" }).success).toBe(false);
  });
  it("DM keys don't depend on order or duplicates", () => {
    expect(dmKey(["b", "a", "b"])).toBe("a:b");
    expect(dmKey(["a", "b"])).toBe(dmKey(["b", "a"]));
  });
});
