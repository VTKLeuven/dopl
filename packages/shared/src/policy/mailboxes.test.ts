import { describe, expect, it } from "vitest";
import { canMailbox, type MailboxAction, type PolicyActor } from "./index";

const actor = (
  userId: string,
  workspaceRole: PolicyActor["workspaceRole"] = "MEMBER",
  kind: PolicyActor["kind"] = "HUMAN",
) => ({ userId, kind, workspaceRole }) as PolicyActor;
const ACTIONS: MailboxAction[] = ["mailbox.read", "mailbox.act", "mailbox.manage"];

describe("mailbox policy", () => {
  it("shared mailboxes: members read and act, admins also manage", () => {
    const shared = { isMember: true };
    expect(canMailbox(actor("m"), shared, "mailbox.act")).toBe(true);
    expect(canMailbox(actor("m"), shared, "mailbox.manage")).toBe(false);
    expect(canMailbox(actor("o"), { isMember: false }, "mailbox.read")).toBe(false);
    expect(canMailbox(actor("a", "ADMIN"), { isMember: false }, "mailbox.manage")).toBe(true);
    expect(canMailbox(actor("g", "GUEST"), shared, "mailbox.read")).toBe(false);
  });

  it("a personal mailbox is its owner's alone, admins included (D-138)", () => {
    const personal = { isMember: false, ownerId: "owner" };
    for (const action of ACTIONS) {
      expect(canMailbox(actor("owner"), personal, action)).toBe(true);
      expect(canMailbox(actor("other"), personal, action)).toBe(false);
      expect(canMailbox(actor("admin", "ADMIN"), personal, action)).toBe(false);
      expect(canMailbox(actor("boss", "OWNER"), personal, action)).toBe(false);
      // Membership rows never open someone else's personal mailbox.
      expect(canMailbox(actor("other"), { ...personal, isMember: true }, action)).toBe(false);
    }
  });

  it("guests and agents never get a personal mailbox", () => {
    expect(
      canMailbox(actor("g", "GUEST"), { isMember: false, ownerId: "g" }, "mailbox.manage"),
    ).toBe(false);
    expect(
      canMailbox(
        actor("bot", "MEMBER", "AGENT"),
        { isMember: false, ownerId: "bot" },
        "mailbox.read",
      ),
    ).toBe(false);
  });
});
