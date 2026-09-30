import { describe, expect, it } from "vitest";
import { db } from "../db";
import { blobStore } from "../storage";
import { avatarKey, parseAvatarUrl } from "../storage/avatars";
import { makeMember, makeWorkspace } from "../testing/fixtures";
import { createAgent, setAgentAvatar } from "./agent";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const file = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string) =>
  new File([bytes], name, { type });

async function exists(url: string) {
  const ref = parseAvatarUrl(url);
  if (!ref) return false;
  return blobStore()
    .stream(avatarKey(ref))
    .then((s) => {
      void s?.cancel();
      return true;
    })
    .catch(() => false);
}

describe("setAgentAvatar", () => {
  it("stores the picture as the agent's image, replaces it and removes it (D-133)", async () => {
    const ws = await makeWorkspace();
    const admin = await makeMember(ws, "ADMIN", "Ada Admin");
    const { userId } = await createAgent(admin);

    const first = await setAgentAvatar(admin, file(PNG, "seppe.png", "image/png"));
    expect(first.image).toMatch(new RegExp(`^/api/avatars/${ws.id}/${userId}/[0-9a-f-]+\\.png$`));
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).image).toBe(first.image);
    expect(await exists(first.image!)).toBe(true);

    const second = await setAgentAvatar(admin, file(PNG, "seppe-2.png", "image/png"));
    expect(second.image).not.toBe(first.image);
    expect(await exists(first.image!)).toBe(false);

    await setAgentAvatar(admin, null);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).image).toBeNull();
    expect(await exists(second.image!)).toBe(false);
    const actions = await db.auditLog.findMany({
      where: { workspaceId: ws.id, action: { startsWith: "agent.avatar" } },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual([
      "agent.avatar_changed",
      "agent.avatar_changed",
      "agent.avatar_removed",
    ]);
  });

  it("refuses non-images, whatever they are called, and members who can't manage the agent", async () => {
    const ws = await makeWorkspace();
    const admin = await makeMember(ws, "ADMIN", "Ada Admin");
    const member = await makeMember(ws, "MEMBER", "Max Member");
    await createAgent(admin);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    await expect(setAgentAvatar(admin, file(svg, "evil.png", "image/png"))).rejects.toThrow(
      "not_an_image",
    );
    await expect(setAgentAvatar(member, file(PNG, "seppe.png", "image/png"))).rejects.toThrow();
  });
});
