import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@dopl/shared/policy";
import { NotFoundError } from "../action-result";
import { getView, listFavoriteViews, listViews } from "../queries/views";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import { createView, deleteView, setViewFavorite, updateView } from "./views";

const filters = { op: "and", items: [{ field: "priority", operator: "in", value: ["HIGH"] }] };

async function setup() {
  const ws = await makeWorkspace();
  const ann = await makeMember(ws, "MEMBER", "Ann");
  const bob = await makeMember(ws, "MEMBER", "Bob");
  const admin = await makeMember(ws, "ADMIN", "Ada");
  const guest = await makeMember(ws, "GUEST", "Gus");
  const project = await makeProject(admin);
  return { ann, bob, admin, guest, project };
}

describe("saved views", () => {
  it("keeps private views to their owner and shares workspace views", async () => {
    const { ann, bob, project } = await setup();
    const mine = await createView(ann, {
      projectId: project.id,
      name: "My urgent",
      filters,
      displayOptions: { layout: "TABLE" },
    });
    const shared = await createView(ann, {
      projectId: project.id,
      name: "Team board",
      visibility: "WORKSPACE",
      filters: { op: "and", items: [] },
      displayOptions: {},
    });
    const annSees = (await listViews(ann, project.id)).map((v) => v.name);
    const bobSees = (await listViews(bob, project.id)).map((v) => v.name);
    expect(annSees).toEqual(["My urgent", "Team board"]);
    expect(bobSees).toEqual(["Team board"]);
    await expect(getView(bob, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    const detail = await getView(ann, mine.id);
    expect(detail.displayOptions.layout).toBe("TABLE");
    expect(detail.filters).toEqual(filters);
    expect((await getView(bob, shared.id)).can).toEqual({ edit: true, delete: false, lock: false });
  });

  it("locks shared views against edits by others", async () => {
    const { ann, bob, admin, project } = await setup();
    const v = await createView(ann, {
      projectId: project.id,
      name: "Shared",
      visibility: "WORKSPACE",
      filters: { op: "and", items: [] },
      displayOptions: {},
    });
    await updateView(bob, { id: v.id, name: "Renamed by Bob" });
    await expect(updateView(bob, { id: v.id, isLocked: true })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await updateView(ann, { id: v.id, isLocked: true });
    await expect(updateView(bob, { id: v.id, filters })).rejects.toBeInstanceOf(ForbiddenError);
    await updateView(admin, { id: v.id, filters });
    expect((await getView(ann, v.id)).filters).toEqual(filters);
    await expect(deleteView(bob, v.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects invalid filters and guests", async () => {
    const { ann, guest, project } = await setup();
    await expect(
      createView(ann, {
        projectId: project.id,
        name: "Bad",
        filters: { op: "and", items: [{ field: "priority", operator: "in", value: ["NOPE"] }] },
        displayOptions: {},
      }),
    ).rejects.toThrow();
    await expect(
      createView(guest, { projectId: null, name: "Nope", filters: {}, displayOptions: {} }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("pins favourites to the sidebar and drops them on delete", async () => {
    const { ann, project } = await setup();
    const a = await createView(ann, {
      projectId: project.id,
      name: "A",
      filters: { op: "and", items: [] },
      displayOptions: {},
    });
    const b = await createView(ann, {
      projectId: null,
      name: "Across projects",
      filters: { op: "and", items: [] },
      displayOptions: {},
    });
    await setViewFavorite(ann, a.id, true);
    await setViewFavorite(ann, b.id, true);
    await setViewFavorite(ann, b.id, true); // idempotent
    const favs = await listFavoriteViews(ann);
    expect(favs.map((f) => f.name)).toEqual(["A", "Across projects"]);
    expect(favs[0]?.href).toContain(`/p/${project.identifier}/views/${a.id}`);
    expect(favs[1]?.href).toMatch(/\/views\//);
    await deleteView(ann, a.id);
    expect((await listFavoriteViews(ann)).map((f) => f.name)).toEqual(["Across projects"]);
  });
});
