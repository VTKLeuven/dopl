import { describe, expect, it } from "vitest";
import { db } from "../db";
import { addToProject, makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import { createComment } from "./comments";
import { deleteMember, inviteMembers } from "./members";
import { createNote } from "./notes";
import { createView } from "./views";
import { createWorkItem } from "./work-items";

const text = (t: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});

async function memberId(workspaceId: string, userId: string) {
  const m = await db.workspaceMember.findFirstOrThrow({ where: { workspaceId, userId } });
  return m.id;
}

describe("deleteMember", () => {
  it("deletes the account and its private data, keeps the team's work and hands over what was shared", async () => {
    const ws = await makeWorkspace();
    const admin = await makeMember(ws, "ADMIN", "Ada Admin");
    // An admin, so they can have sent an invite that's still pending.
    const leaver = await makeMember(ws, "ADMIN", "Lee Leaver");
    const project = await makeProject(admin);
    await addToProject(project.id, leaver, "MEMBER");

    const item = await createWorkItem(leaver, { projectId: project.id, title: "Printer jam" });
    await createComment(leaver, { workItemId: item.id, body: text("Fixed the tray.") });
    const note = await createNote(leaver, { content: text("My own notes") });
    const privateView = await createView(leaver, {
      projectId: project.id,
      name: "Mine",
      filters: { op: "and", items: [] },
      displayOptions: {},
    });
    const sharedView = await createView(leaver, {
      projectId: project.id,
      name: "Team board",
      visibility: "WORKSPACE",
      filters: { op: "and", items: [] },
      displayOptions: {},
    });
    const newbie = `newbie-${Math.random().toString(36).slice(2, 8)}@dopl.test`;
    await inviteMembers(leaver, { emails: newbie, role: "MEMBER", projectIds: [] });

    await deleteMember(admin, await memberId(ws.id, leaver.actor.userId));

    expect(await db.user.findUnique({ where: { id: leaver.actor.userId } })).toBeNull();
    expect(await db.note.findUnique({ where: { id: note.id } })).toBeNull();
    expect(await db.view.findUnique({ where: { id: privateView.id } })).toBeNull();
    expect(await db.view.findUniqueOrThrow({ where: { id: sharedView.id } })).toMatchObject({
      ownerId: admin.actor.userId,
    });
    expect(await db.workItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      createdById: null,
    });
    const comments = await db.comment.findMany({ where: { workItemId: item.id } });
    expect(comments).toHaveLength(1);
    expect(comments[0]!.authorId).toBeNull();
    const invite = await db.workspaceInvite.findFirstOrThrow({
      where: { workspaceId: ws.id, email: newbie, revokedAt: null },
    });
    expect(invite.invitedById).toBe(admin.actor.userId);
    const log = await db.auditLog.findFirstOrThrow({
      where: { workspaceId: ws.id, action: "member.deleted" },
    });
    expect(log).toMatchObject({ actorId: admin.actor.userId, targetId: leaver.actor.userId });
    expect(log.metadata).toMatchObject({ email: leaver.actor.email, name: "Lee Leaver" });
  });

  it("refuses yourself, owners for admins, non-admins and accounts other workspaces use", async () => {
    const ws = await makeWorkspace();
    const owner = await makeMember(ws, "OWNER", "Olivia Owner");
    const admin = await makeMember(ws, "ADMIN", "Ada Admin");
    const member = await makeMember(ws, "MEMBER", "Max Member");

    await expect(deleteMember(admin, await memberId(ws.id, admin.actor.userId))).rejects.toThrow(
      "self",
    );
    await expect(deleteMember(admin, await memberId(ws.id, owner.actor.userId))).rejects.toThrow();
    await expect(deleteMember(member, await memberId(ws.id, admin.actor.userId))).rejects.toThrow();

    const other = await makeWorkspace();
    await db.workspaceMember.create({
      data: {
        workspaceId: other.id,
        userId: member.actor.userId,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
    await expect(deleteMember(admin, await memberId(ws.id, member.actor.userId))).rejects.toThrow(
      "other_workspace",
    );
    expect(await db.user.findUnique({ where: { id: member.actor.userId } })).not.toBeNull();

    // Owners can delete another owner.
    const second = await makeMember(ws, "OWNER", "Sam Second");
    await deleteMember(owner, await memberId(ws.id, second.actor.userId));
    expect(await db.user.findUnique({ where: { id: second.actor.userId } })).toBeNull();
  });
});
