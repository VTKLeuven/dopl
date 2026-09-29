import { describe, expect, it } from "vitest";
import { canNote, type PolicyActor, type PolicyNote } from "./index";

const actor = (userId: string, workspaceRole: PolicyActor["workspaceRole"] = "MEMBER") =>
  ({ userId, kind: "HUMAN", workspaceRole }) as PolicyActor;
const note = (over: Partial<PolicyNote> = {}): PolicyNote => ({
  ownerId: "owner",
  visibility: "PRIVATE",
  archived: false,
  deleted: false,
  attachedProjectVisible: false,
  ...over,
});

describe("note policy", () => {
  it("private notes are the owner's alone, even for admins", () => {
    expect(canNote(actor("owner"), note(), "note.view")).toBe(true);
    expect(canNote(actor("other"), note(), "note.view")).toBe(false);
    expect(canNote(actor("admin", "OWNER"), note(), "note.view")).toBe(false);
  });

  it("team notes are visible to members but not guests", () => {
    const shared = note({ visibility: "WORKSPACE" });
    expect(canNote(actor("other"), shared, "note.view")).toBe(true);
    expect(canNote(actor("guest", "GUEST"), shared, "note.view")).toBe(false);
  });

  it("attached notes follow project access", () => {
    expect(canNote(actor("other"), note({ attachedProjectVisible: true }), "note.view")).toBe(true);
    expect(canNote(actor("other"), note({ attachedProjectVisible: false }), "note.view")).toBe(
      false,
    );
    expect(
      canNote(actor("guest", "GUEST"), note({ attachedProjectVisible: true }), "note.view"),
    ).toBe(false);
  });

  it("archived and trashed notes disappear for everyone but the owner", () => {
    const shared = { visibility: "WORKSPACE" as const };
    expect(canNote(actor("other"), note({ ...shared, archived: true }), "note.view")).toBe(false);
    expect(canNote(actor("other"), note({ ...shared, deleted: true }), "note.view")).toBe(false);
    expect(canNote(actor("owner"), note({ ...shared, deleted: true }), "note.view")).toBe(true);
  });

  it("only the owner edits; guests can't share or convert", () => {
    const shared = note({ visibility: "WORKSPACE" });
    expect(canNote(actor("other"), shared, "note.edit")).toBe(false);
    expect(canNote(actor("admin", "ADMIN"), shared, "note.edit")).toBe(false);
    expect(canNote(actor("owner"), shared, "note.edit")).toBe(true);
    expect(canNote(actor("owner"), shared, "note.share")).toBe(true);
    const guestNote = note({ ownerId: "guest" });
    expect(canNote(actor("guest", "GUEST"), guestNote, "note.edit")).toBe(true);
    expect(canNote(actor("guest", "GUEST"), guestNote, "note.share")).toBe(false);
    expect(canNote(actor("guest", "GUEST"), guestNote, "note.convert")).toBe(false);
  });
});
