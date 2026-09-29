import { describe, expect, it } from "vitest";
import pino from "pino";
import { createDbClient } from "@dopl/db";
import { renderEmail } from "@dopl/shared/emails";
import { sendDigests } from "./digest";

const db = createDbClient({
  connectionString: process.env.DATABASE_URL ?? "",
  applicationName: "dopl-worker-test",
  maxConnections: 2,
});
const logger = pino({ level: "silent" });

function fakeBoss() {
  const sent: Array<{ name: string; data: { outboundEmailId: string } }> = [];
  return {
    sent,
    boss: {
      send: (name: string, data: { outboundEmailId: string }) => {
        sent.push({ name, data });
        return Promise.resolve("job");
      },
    } as never,
  };
}

async function setup() {
  const ws = await db.workspace.create({
    data: { slug: `d-${crypto.randomUUID().slice(0, 8)}`, name: "VTK IT" },
  });
  const person = async (name: string) => {
    const user = await db.user.create({
      data: { email: `${crypto.randomUUID()}@dopl.test`, name, emailVerified: true },
    });
    await db.workspaceMember.create({
      data: { workspaceId: ws.id, userId: user.id, role: "MEMBER", status: "ACTIVE" },
    });
    return user;
  };
  const ann = await person("Ann Admin");
  const bram = await person("Bram Member");
  const chloe = await person("Chloé Member");
  return { ws, ann, bram, chloe };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

describe("email.digest", () => {
  it("batches unread, un-emailed notifications per person with email on", async () => {
    const { ws, ann, bram, chloe } = await setup();
    await db.notificationPreference.createMany({
      data: [
        { userId: bram.id, workspaceId: ws.id, type: "MENTION", email: true },
        { userId: bram.id, workspaceId: ws.id, type: "ASSIGNED", email: true },
      ],
    });
    const base = { workspaceId: ws.id, actorId: ann.id, entityType: "WORK_ITEM" as const };
    const make = (recipientId: string, type: "MENTION" | "ASSIGNED" | "COMMENT", extra = {}) =>
      db.notification.create({
        data: {
          ...base,
          recipientId,
          type,
          entityId: crypto.randomUUID(),
          data: { identifier: "INFRA-7", title: "Rotate certificates", excerpt: "have a look" },
          createdAt: minutesAgo(10),
          ...extra,
        },
      });
    const mention = await make(bram.id, "MENTION");
    const assigned = await make(bram.id, "ASSIGNED");
    const comment = await make(bram.id, "COMMENT"); // email off (default)
    const read = await make(bram.id, "MENTION", { readAt: new Date() });
    const fresh = await make(bram.id, "MENTION", { createdAt: new Date() }); // too new
    const other = await make(chloe.id, "MENTION"); // Chloé has email off

    const { boss, sent } = fakeBoss();
    const result = await sendDigests({ db, boss, logger, appUrl: "https://dopl.example" });
    expect(result.emails).toBeGreaterThanOrEqual(1);
    const mine = await db.outboundEmail.findMany({ where: { workspaceId: ws.id } });
    expect(mine).toHaveLength(1);
    const email = mine[0];
    expect(email).toMatchObject({ templateKey: "inbox.digest", toAddress: bram.email });
    expect(sent.map((s) => s.data.outboundEmailId)).toContain(email?.id);

    const payload = email?.payload as {
      total: number;
      items: Array<{ headline: string; url: string }>;
    };
    expect(payload.total).toBe(2);
    expect(payload.items.map((i) => i.headline).sort()).toEqual([
      "Ann Admin assigned you INFRA-7",
      "Ann Admin mentioned you in INFRA-7",
    ]);
    const rendered = renderEmail("inbox.digest", payload as never, "https://dopl.example");
    expect(rendered.subject).toBe("2 unread notifications in VTK IT");
    expect(rendered.html).toContain("Open Inbox");

    const after = await db.notification.findMany({
      where: { id: { in: [mention.id, assigned.id, comment.id, read.id, fresh.id, other.id] } },
      select: { id: true, emailedAt: true },
    });
    const emailed = new Set(after.filter((n) => n.emailedAt).map((n) => n.id));
    expect(emailed).toEqual(new Set([mention.id, assigned.id]));

    // A second run finds nothing new for this workspace.
    await sendDigests({ db, boss, logger, appUrl: "https://dopl.example" });
    expect(await db.outboundEmail.count({ where: { workspaceId: ws.id } })).toBe(1);
  });

  it("a project preference overrides the workspace one", async () => {
    const { ws, ann, bram } = await setup();
    const projectId = crypto.randomUUID();
    await db.notificationPreference.createMany({
      data: [
        { userId: bram.id, workspaceId: ws.id, type: "COMMENT", email: true },
        { userId: bram.id, workspaceId: ws.id, projectId, type: "COMMENT", email: false },
      ],
    });
    await db.notification.create({
      data: {
        workspaceId: ws.id,
        recipientId: bram.id,
        actorId: ann.id,
        type: "COMMENT",
        entityType: "COMMENT",
        entityId: crypto.randomUUID(),
        projectId,
        data: { title: "Quiet project" },
        createdAt: minutesAgo(5),
      },
    });
    const { boss } = fakeBoss();
    await sendDigests({ db, boss, logger, appUrl: "https://dopl.example" });
    expect(await db.outboundEmail.count({ where: { workspaceId: ws.id } })).toBe(0);
  });
});
