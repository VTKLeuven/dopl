import { describe, expect, it } from "vitest";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import { createProject } from "../services/projects";
import { createWorkItem } from "../services/work-items";
import { TopicAccess } from "./access";
import type { RealtimeMessage } from "./listener";

const msg = (topic: string, type = "workItem.updated"): RealtimeMessage => ({
  id: "1",
  workspaceId: "",
  topic,
  type,
  payload: {},
});

describe("realtime topic access", () => {
  it("only delivers events for projects, items and users the member can see", async () => {
    const ws = await makeWorkspace();
    const admin = await makeMember(ws, "ADMIN", "Ada");
    const member = await makeMember(ws, "MEMBER", "Mo");
    const open = await makeProject(admin);
    const secret = await createProject(admin, {
      name: "Secret",
      identifier: `S${Date.now().toString(36).slice(-5).toUpperCase()}`,
      visibility: "PRIVATE",
    });
    const openItem = await createWorkItem(admin, { projectId: open.id, title: "open" });
    const secretItem = await createWorkItem(admin, { projectId: secret.id, title: "secret" });

    const access = new TopicAccess(member);
    await access.refresh();
    expect(await access.allows(msg(`project:${open.id}`))).toBe(true);
    expect(await access.allows(msg(`project:${secret.id}`))).toBe(false);
    expect(await access.allows(msg(`workItem:${openItem.id}`, "comment.created"))).toBe(true);
    expect(await access.allows(msg(`workItem:${secretItem.id}`, "comment.created"))).toBe(false);
    expect(await access.allows(msg(`workspace:${ws.id}`, "project.created"))).toBe(true);
    expect(await access.allows(msg(`workspace:other`, "project.created"))).toBe(false);
    expect(await access.allows(msg(`user:${member.actor.userId}`, "notification"))).toBe(true);
    expect(await access.allows(msg(`user:${admin.actor.userId}`, "notification"))).toBe(false);

    const adminAccess = new TopicAccess(admin);
    await adminAccess.refresh();
    expect(await adminAccess.allows(msg(`project:${secret.id}`))).toBe(true);
  });

  it("flags events that change access", () => {
    expect(TopicAccess.affectsAccess(msg("workspace:x", "project.created"))).toBe(true);
    expect(TopicAccess.affectsAccess(msg("workspace:x", "member.updated"))).toBe(true);
    expect(TopicAccess.affectsAccess(msg("project:x", "workItem.updated"))).toBe(false);
  });
});
