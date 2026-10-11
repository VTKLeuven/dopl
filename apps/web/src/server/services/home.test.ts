import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { DEFAULT_HOME_LAYOUT } from "@dopl/shared/domain/home";
import type { HomeLayout } from "@dopl/shared/schemas/home";
import { ConflictError, NotFoundError } from "../action-result";
import { db } from "../db";
import { getHomeLayout, getViewPreview } from "../queries/home";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import type { WorkspaceCtx } from "../session";
import { saveHomeLayout } from "./home";
import { createView } from "./views";
import { createWorkItem } from "./work-items";

const custom: HomeLayout = {
  widgets: [
    { id: "w", type: "week", zone: "top" },
    { id: "t", type: "taggedNotes", zone: "main", tag: "infra", count: 4 },
    { id: "d", type: "todos", zone: "side" },
  ],
};

const memberRow = (ctx: WorkspaceCtx) =>
  db.workspaceMember.findUniqueOrThrow({
    where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: ctx.actor.userId } },
    select: { preferences: true },
  });

describe("home layout", () => {
  it("is the default until the member saves one, and back after a reset", async () => {
    const ws = await makeWorkspace();
    const ann = await makeMember(ws, "MEMBER", "Ann");
    expect(await getHomeLayout(ann)).toEqual({ layout: DEFAULT_HOME_LAYOUT, custom: false });

    await saveHomeLayout(ann, { layout: custom });
    expect(await getHomeLayout(ann)).toEqual({ layout: custom, custom: true });

    await saveHomeLayout(ann, { layout: null });
    expect(await getHomeLayout(ann)).toEqual({ layout: DEFAULT_HOME_LAYOUT, custom: false });
  });

  it("keeps the member's other preferences and touches nobody else's", async () => {
    const ws = await makeWorkspace();
    const ann = await makeMember(ws, "MEMBER", "Ann");
    const bob = await makeMember(ws, "MEMBER", "Bob");
    await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: ann.actor.userId } },
      data: { preferences: { density: "compact" } },
    });
    await saveHomeLayout(ann, { layout: custom });
    expect((await memberRow(ann)).preferences).toEqual({ density: "compact", home: custom });
    expect((await getHomeLayout(bob)).custom).toBe(false);

    await saveHomeLayout(ann, { layout: null });
    expect((await memberRow(ann)).preferences).toEqual({ density: "compact" });
  });

  it("tells the member's other tabs", async () => {
    const ws = await makeWorkspace();
    const ann = await makeMember(ws, "MEMBER", "Ann");
    await saveHomeLayout(ann, { layout: custom });
    const events = await db.realtimeEvent.findMany({
      where: { workspaceId: ws.id, topic: `user:${ann.actor.userId}`, type: "home.layout" },
    });
    expect(events).toHaveLength(1);
  });

  it("refuses duplicates and malformed widgets", async () => {
    const ws = await makeWorkspace();
    const ann = await makeMember(ws, "MEMBER", "Ann");
    const twice: HomeLayout = {
      widgets: [
        { id: "a", type: "inbox", zone: "side" },
        { id: "b", type: "inbox", zone: "main" },
      ],
    };
    await expect(saveHomeLayout(ann, { layout: twice })).rejects.toBeInstanceOf(ConflictError);
    await expect(
      saveHomeLayout(ann, { layout: { widgets: [{ id: "x", type: "view", zone: "main" }] } }),
    ).rejects.toBeInstanceOf(ZodError);
    expect((await getHomeLayout(ann)).custom).toBe(false);
  });

  it("drops stored widgets that no longer parse instead of resetting the page", async () => {
    const ws = await makeWorkspace();
    const ann = await makeMember(ws, "MEMBER", "Ann");
    await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: ann.actor.userId } },
      data: {
        preferences: {
          home: {
            widgets: [
              { id: "old", type: "retired-widget", zone: "main" },
              { id: "d", type: "todos", zone: "side" },
            ],
          },
        },
      },
    });
    expect(await getHomeLayout(ann)).toEqual({
      layout: { widgets: [{ id: "d", type: "todos", zone: "side" }] },
      custom: true,
    });
  });
});

describe("view widget preview", () => {
  it("lists the view's open items and hides views the reader can't open", async () => {
    const ws = await makeWorkspace();
    const ann = await makeMember(ws, "ADMIN", "Ann");
    const bob = await makeMember(ws, "MEMBER", "Bob");
    const project = await makeProject(ann);
    await createWorkItem(ann, {
      projectId: project.id,
      title: "Patch the firewall",
      priority: "HIGH",
    });
    await createWorkItem(ann, { projectId: project.id, title: "Tidy the wiki", priority: "LOW" });
    const done = await createWorkItem(ann, {
      projectId: project.id,
      title: "Old urgent thing",
      priority: "HIGH",
    });
    await db.workItem.update({
      where: { id: done.id },
      data: { stateId: project.byName("Done").id, stateGroup: "COMPLETED" },
    });
    const view = await createView(ann, {
      projectId: project.id,
      name: "High priority",
      filters: { op: "and", items: [{ field: "priority", operator: "in", value: ["HIGH"] }] },
      displayOptions: {},
    });

    const preview = await getViewPreview(ann, view.id);
    expect(preview.view).toEqual({
      id: view.id,
      name: "High priority",
      href: `/${ws.slug}/p/${project.identifier}/views/${view.id}`,
    });
    expect(preview.rows.map((r) => r.title)).toEqual(["Patch the firewall"]);
    expect(preview.rows[0]?.stateName).not.toBe("");
    expect(preview.more).toBe(false);

    // Private views stay private, on Home too.
    await expect(getViewPreview(bob, view.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("says when there is more than the preview shows", async () => {
    const ws = await makeWorkspace();
    const ann = await makeMember(ws, "ADMIN", "Ann");
    const project = await makeProject(ann);
    for (let i = 0; i < 3; i++)
      await createWorkItem(ann, { projectId: project.id, title: `Item ${i}` });
    const view = await createView(ann, {
      projectId: null,
      name: "Everything",
      filters: { op: "and", items: [] },
      displayOptions: {},
    });
    const preview = await getViewPreview(ann, view.id, 2);
    expect(preview.rows).toHaveLength(2);
    expect(preview.more).toBe(true);
    expect(preview.view.href).toBe(`/${ws.slug}/views/${view.id}`);
  });
});
