import { describe, expect, it } from "vitest";
import pino from "pino";
import { createDbClient } from "@dopl/db";
import { sealSecret } from "@dopl/shared/secretbox";
import { deliverWebhook } from "./webhooks";

const db = createDbClient({
  connectionString: process.env.DATABASE_URL ?? "",
  applicationName: "dopl-worker-test",
  maxConnections: 2,
});
const KEY = "test-key-test-key-test-key-test-key-00";
const logger = pino({ level: "silent" });
const sent: Array<{ startAfter?: Date }> = [];
const boss = {
  send: (_name: string, _data: object, opts?: { startAfter?: Date }) => {
    sent.push({ startAfter: opts?.startAfter });
    return Promise.resolve("job");
  },
} as never;

async function setup(status = 204, body: unknown = null) {
  const ws = await db.workspace.create({
    data: { slug: `w-${crypto.randomUUID().slice(0, 8)}`, name: "VTK IT" },
  });
  const hook = await db.outgoingWebhook.create({
    data: {
      workspaceId: ws.id,
      name: "#it",
      urlEncrypted: sealSecret("http://localhost:4599/hook", KEY),
      urlHint: "localhost",
      events: ["work_item.created"],
    },
  });
  const delivery = await db.webhookDelivery.create({
    data: {
      webhookId: hook.id,
      workspaceId: ws.id,
      eventType: "test",
      entityType: "WORKSPACE",
      entityId: ws.id,
      payload: {
        events: [{ type: "work_item.created", at: new Date().toISOString() }],
        test: true,
      },
    },
  });
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return Promise.resolve(
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch;
  const deps = {
    db,
    boss,
    logger,
    appUrl: "https://dopl.test",
    encryptionKey: KEY,
    fetch: fetchImpl,
  };
  return { ws, hook, delivery, calls, deps };
}

describe("webhook.deliver", () => {
  it("posts the rendered message with mentions disabled and marks it sent", async () => {
    const { delivery, hook, calls, deps } = await setup();
    expect(await deliverWebhook(delivery.id, deps)).toBe("sent");
    expect(calls[0]?.url).toBe("http://localhost:4599/hook");
    expect(calls[0]?.body).toMatchObject({ username: "Dopl", allowed_mentions: { parse: [] } });
    const row = await db.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(row.status).toBe("SENT");
    expect(
      (await db.outgoingWebhook.findUniqueOrThrow({ where: { id: hook.id } })).failureCount,
    ).toBe(0);
    // Running the job twice never posts twice.
    expect(await deliverWebhook(delivery.id, deps)).toBe("skipped");
    expect(calls).toHaveLength(1);
  });

  it("honours Discord's 429 retry_after without counting a failure", async () => {
    const { delivery, hook, deps } = await setup(429, { retry_after: 2.5 });
    const before = Date.now();
    expect(await deliverWebhook(delivery.id, deps)).toBe("rescheduled");
    const row = await db.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(row.status).toBe("PENDING");
    expect(row.notBefore.getTime()).toBeGreaterThanOrEqual(before + 2_500);
    expect(sent.at(-1)?.startAfter?.getTime()).toBe(row.notBefore.getTime());
    expect(
      (await db.outgoingWebhook.findUniqueOrThrow({ where: { id: hook.id } })).failureCount,
    ).toBe(0);
  });

  it("auto-disables after ten failures in a row and tells the admins", async () => {
    const { ws, hook, deps } = await setup(404, { message: "Unknown Webhook" });
    const admin = await db.user.create({
      data: { email: `${crypto.randomUUID()}@dopl.test`, name: "Ann" },
    });
    await db.workspaceMember.create({
      data: { workspaceId: ws.id, userId: admin.id, role: "ADMIN" },
    });
    await db.outgoingWebhook.update({ where: { id: hook.id }, data: { failureCount: 9 } });
    const d = await db.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        workspaceId: ws.id,
        eventType: "test",
        entityType: "WORKSPACE",
        entityId: ws.id,
        payload: {
          events: [{ type: "work_item.created", at: new Date().toISOString() }],
          test: true,
        },
      },
    });
    expect(await deliverWebhook(d.id, deps)).toBe("failed");
    const after = await db.outgoingWebhook.findUniqueOrThrow({ where: { id: hook.id } });
    expect(after.enabled).toBe(false);
    expect(after.disabledReason).toContain("10");
    expect(
      await db.notification.count({ where: { recipientId: admin.id, type: "INTEGRATION_FAILED" } }),
    ).toBe(1);
    // Anything still queued for a disabled hook is dropped.
    const queued = await db.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        workspaceId: ws.id,
        eventType: "test",
        entityType: "WORKSPACE",
        entityId: ws.id,
        payload: {
          events: [{ type: "work_item.created", at: new Date().toISOString() }],
          test: true,
        },
      },
    });
    expect(await deliverWebhook(queued.id, deps)).toBe("dropped");
  });
});
