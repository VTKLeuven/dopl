import { describe, expect, it } from "vitest";
import { DeliveryPayloadSchema } from "@dopl/shared/schemas/webhooks";
import { db } from "../db";
import { makeMember, makeProject, makePublishedForm, makeWorkspace } from "../testing/fixtures";
import { submitPublicForm } from "./public-intake";
import {
  createWebhook,
  deleteWebhook,
  revealWebhookUrl,
  sendTestMessage,
  updateWebhook,
} from "./webhooks";
import { createWorkItem, updateWorkItem } from "./work-items";

const URL = "http://localhost:4599/discord";

async function setup(events: string[], projectIds?: string[]) {
  const ws = await makeWorkspace();
  const admin = await makeMember(ws, "ADMIN", "Ann Admin");
  const project = await makeProject(admin);
  const hook = await createWebhook(admin, {
    name: "#it-tickets",
    url: URL,
    events,
    projectIds: projectIds ?? [],
  });
  return { ws, admin, project, hook };
}

describe("webhooks", () => {
  it("stores the URL encrypted and only admins manage them", async () => {
    const { ws, hook } = await setup(["work_item.created"]);
    const row = await db.outgoingWebhook.findUniqueOrThrow({ where: { id: hook.id } });
    expect(row.urlEncrypted).not.toContain("localhost");
    expect(revealWebhookUrl(row.urlEncrypted)).toBe(URL);
    expect(row.urlHint).toBe("localhost:4599");
    const member = await makeMember(ws, "MEMBER");
    await expect(
      createWebhook(member, { name: "x", url: URL, events: ["work_item.created"] }),
    ).rejects.toThrow();
    expect(
      await db.auditLog.count({ where: { targetId: hook.id, action: "webhook.created" } }),
    ).toBe(1);
  });

  it("refuses URLs outside Discord (no SSRF into the network)", async () => {
    const { admin } = await setup(["work_item.created"]);
    await expect(
      createWebhook(admin, {
        name: "x",
        url: "http://169.254.169.254/latest/meta-data",
        events: ["work_item.created"],
      }),
    ).rejects.toThrow("invalid_webhook_url");
  });

  it("queues one delivery per new item, filtered by project", async () => {
    const { admin, project } = await setup(["work_item.created"]);
    const other = await makeProject(admin);
    const scoped = await createWebhook(admin, {
      name: "scoped",
      url: URL,
      events: ["work_item.created"],
      projectIds: [other.id],
    });
    await createWorkItem(admin, { projectId: project.id, title: "A" });
    await createWorkItem(admin, { projectId: other.id, title: "B" });
    expect(await db.webhookDelivery.count({ where: { webhookId: scoped.id } })).toBe(1);
    const all = await db.webhookDelivery.count({
      where: { workspaceId: admin.workspace.id, eventType: "work_item.created" },
    });
    expect(all).toBe(3);
  });

  it("coalesces five quick edits to one item into one delivery", async () => {
    const { admin, project, hook } = await setup([
      "work_item.state_changed",
      "work_item.completed",
      "work_item.assigned",
    ]);
    const item = await createWorkItem(admin, { projectId: project.id, title: "Flaky switch" });
    for (const name of ["Todo", "In progress", "In review", "In progress", "Done"])
      await updateWorkItem(admin, { id: item.id, stateId: project.byName(name).id });
    const deliveries = await db.webhookDelivery.findMany({ where: { webhookId: hook.id } });
    expect(deliveries).toHaveLength(1);
    const payload = DeliveryPayloadSchema.parse(deliveries[0]!.payload);
    expect(payload.events.map((e) => e.type)).toEqual([
      "work_item.state_changed",
      "work_item.state_changed",
      "work_item.state_changed",
      "work_item.state_changed",
      "work_item.state_changed",
      "work_item.completed",
    ]);
    expect(deliveries[0]!.notBefore.getTime()).toBeGreaterThan(Date.now());
  });

  it("sends intake submissions and test messages right away; disabled hooks get nothing", async () => {
    const { admin, project, hook } = await setup(["intake.submitted"]);
    const form = await makePublishedForm(admin, project.id);
    await submitPublicForm(
      form.slug,
      {
        clientSubmissionId: crypto.randomUUID(),
        email: "x@example.test",
        values: { summary: "@everyone hi" },
        startedAt: Date.now() - 10_000,
      },
      { ip: "203.0.113.9", userAgent: null },
    );
    const d = await db.webhookDelivery.findFirstOrThrow({ where: { webhookId: hook.id } });
    expect(d.eventType).toBe("intake.submitted");
    expect(d.notBefore.getTime()).toBeLessThanOrEqual(Date.now());
    await sendTestMessage(admin, hook.id);
    expect(
      await db.webhookDelivery.count({ where: { webhookId: hook.id, eventType: "test" } }),
    ).toBe(1);

    await updateWebhook(admin, { id: hook.id, enabled: false });
    await submitPublicForm(
      form.slug,
      {
        clientSubmissionId: crypto.randomUUID(),
        email: "y@example.test",
        values: { summary: "again" },
        startedAt: Date.now() - 10_000,
      },
      { ip: "203.0.113.10", userAgent: null },
    );
    expect(
      await db.webhookDelivery.count({
        where: { webhookId: hook.id, eventType: "intake.submitted" },
      }),
    ).toBe(1);
    await deleteWebhook(admin, hook.id);
    expect(await db.webhookDelivery.count({ where: { webhookId: hook.id } })).toBe(0);
  });
});
