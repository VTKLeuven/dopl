import { describe, expect, it } from "vitest";
import {
  canChannel,
  type ChannelAction,
  type PolicyActor,
  type PolicyChannel,
  type PolicyProject,
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
  guestsCanViewProject: true,
  archivedAt: null,
  memberRole: null,
  ...p,
});
const channel = (c: Partial<PolicyChannel> = {}): PolicyChannel => ({
  kind: "CUSTOM",
  isPrivate: false,
  archivedAt: null,
  memberRole: null,
  project: null,
  ...c,
});
const all: ChannelAction[] = [
  "channel.view",
  "channel.post",
  "channel.join",
  "channel.leave",
  "channel.members",
  "channel.manage",
];
const allowed = (a: PolicyActor, c: PolicyChannel) => all.filter((x) => canChannel(a, c, x));

describe("channel policy", () => {
  it("guests never see team chat, not even DMs they are part of", () => {
    const guest = actor("GUEST");
    expect(allowed(guest, channel())).toEqual([]);
    expect(allowed(guest, channel({ kind: "DM", memberRole: "MEMBER" }))).toEqual([]);
    expect(
      allowed(guest, channel({ kind: "PROJECT", project: project({ memberRole: "GUEST" }) })),
    ).toEqual([]);
  });

  it("project channels follow project access", () => {
    const open = channel({ kind: "PROJECT", project: project() });
    expect(allowed(actor("MEMBER"), open)).toEqual([
      "channel.view",
      "channel.post",
      "channel.join",
    ]);
    const secret = channel({ kind: "PROJECT", project: project({ visibility: "PRIVATE" }) });
    expect(allowed(actor("MEMBER"), secret)).toEqual([]);
    const mine = channel({
      kind: "PROJECT",
      project: project({ visibility: "PRIVATE", memberRole: "ADMIN" }),
    });
    expect(canChannel(actor("MEMBER"), mine, "channel.manage")).toBe(true);
    const archived = channel({ kind: "PROJECT", project: project({ archivedAt: new Date() }) });
    expect(canChannel(actor("MEMBER"), archived, "channel.view")).toBe(true);
    expect(canChannel(actor("MEMBER"), archived, "channel.post")).toBe(false);
  });

  it("public channels are open to members; private ones only to their members", () => {
    expect(allowed(actor("MEMBER"), channel())).toEqual([
      "channel.view",
      "channel.post",
      "channel.join",
    ]);
    expect(allowed(actor("MEMBER"), channel({ memberRole: "MEMBER" }))).toEqual([
      "channel.view",
      "channel.post",
      "channel.leave",
      "channel.members",
    ]);
    expect(allowed(actor("MEMBER"), channel({ isPrivate: true }))).toEqual([]);
    // Admins get no backdoor into private channels…
    expect(allowed(actor("ADMIN"), channel({ isPrivate: true }))).toEqual([]);
    // …but manage public ones.
    expect(canChannel(actor("ADMIN"), channel(), "channel.manage")).toBe(true);
    expect(canChannel(actor("MEMBER"), channel({ memberRole: "OWNER" }), "channel.manage")).toBe(
      true,
    );
    const archived = channel({ memberRole: "MEMBER", archivedAt: new Date() });
    expect(canChannel(actor("MEMBER"), archived, "channel.post")).toBe(false);
  });

  it("DMs belong to their participants", () => {
    expect(allowed(actor("OWNER"), channel({ kind: "DM" }))).toEqual([]);
    expect(allowed(actor("MEMBER"), channel({ kind: "GROUP_DM", memberRole: "MEMBER" }))).toEqual([
      "channel.view",
      "channel.post",
    ]);
    // The AI teammate can be DM'd like anyone else.
    expect(
      canChannel(
        actor("MEMBER", { kind: "AGENT" }),
        channel({ kind: "DM", memberRole: "MEMBER" }),
        "channel.post",
      ),
    ).toBe(true);
  });
});
