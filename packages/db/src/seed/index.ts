/**
 * Deterministic dev/demo seed (DATA_MODEL §9). Refuses to run in production.
 *
 *   pnpm db:seed              (skips if the workspace already has projects)
 *   pnpm db:seed -- --reset   (rebuilds the seeded projects and notes; keeps users)
 *
 * Creates (or tops up) workspace "vtk" with the people in ./data.ts — all with
 * the password `dopl-dev-password` — five projects and ~300 work items with
 * sub-items, relations, comments and history. Structure is deterministic
 * (fixed PRNG seed); dates are relative to today so the data always looks fresh.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { defaultStates, defaultWorkItemTypes } from "@dopl/shared/defaults";
import { keysBetween } from "@dopl/shared/sort-keys";
import { uuidv7 } from "@dopl/shared/ids";
import { createDbClient } from "../client";
import type { Prisma } from "../generated/prisma/client";
import { commentBank, people, projects } from "./data";
import { seedIntake } from "./intake";
import { seedAnalytics } from "./analytics";
import { seedNotes } from "./notes";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../../.env"), quiet: true });

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}

const DEV_PASSWORD = "dopl-dev-password";
const db = createDbClient({
  connectionString: process.env.DATABASE_URL ?? "",
  applicationName: "dopl-seed",
  maxConnections: 2,
});

// mulberry32 — tiny deterministic PRNG
let seed = 0x2f6b1d3;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const chance = (p: number) => rand() < p;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const weighted = <T>(entries: Array<[T, number]>): T => {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) if ((r -= w) <= 0) return v;
  return entries[entries.length - 1]![0];
};

const DAY = 24 * 60 * 60 * 1000;
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const daysFromToday = (d: number) => new Date(today.getTime() + d * DAY);
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

async function main() {
  const workspace =
    (await db.workspace.findUnique({ where: { slug: "vtk" } })) ??
    (await db.workspace.create({ data: { slug: "vtk", name: "VTK IT" } }));

  if (process.argv.includes("--reset")) {
    // Dev only (guarded above): rebuild the seeded projects from scratch.
    // Users, passwords and 2FA settings are kept.
    const seeded = projects.map((p) => p.identifier).concat(["E2E"]);
    const removed = await db.project.deleteMany({
      where: { workspaceId: workspace.id, identifier: { in: seeded } },
    });
    await db.viewPreference.deleteMany({ where: { workspaceId: workspace.id } });
    // Notes (and their tags and to-dos) are reseeded too.
    await db.note.deleteMany({ where: { workspaceId: workspace.id } });
    await db.tag.deleteMany({ where: { workspaceId: workspace.id } });
    console.log(`Reset: removed ${removed.count} seeded project(s).`);
  }

  const existingProjects = await db.project.count({
    where: { workspaceId: workspace.id, deletedAt: null },
  });
  if (existingProjects > 0 && !process.argv.includes("--force-add")) {
    console.log(
      `Workspace "${workspace.slug}" already has ${existingProjects} project(s); seed skipped (pass --force-add to add anyway).`,
    );
    return;
  }

  // Work item types
  let types = await db.workItemType.findMany({ where: { workspaceId: workspace.id } });
  if (types.length === 0) {
    const keys = keysBetween(null, null, defaultWorkItemTypes.length);
    await db.workItemType.createMany({
      data: defaultWorkItemTypes.map((t, i) => ({
        workspaceId: workspace.id,
        name: t.name,
        icon: t.icon,
        color: t.color,
        isDefault: t.isDefault ?? false,
        sortKey: keys[i]!,
      })),
    });
    types = await db.workItemType.findMany({ where: { workspaceId: workspace.id } });
  }

  // People (dev passwords only — this script never runs in production)
  const hash = await hashPassword(DEV_PASSWORD);
  const users: Array<{ id: string; name: string; role: (typeof people)[number]["role"] }> = [];
  for (const p of people) {
    const user = await db.user.upsert({
      where: { email: p.email },
      create: { email: p.email, name: p.name, emailVerified: true },
      update: { name: p.name, emailVerified: true },
    });
    await db.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      create: { workspaceId: workspace.id, userId: user.id, role: p.role, status: "ACTIVE" },
      update: { role: p.role, status: "ACTIVE" },
    });
    const credential = await db.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });
    if (!credential) {
      await db.account.create({
        data: { userId: user.id, providerId: "credential", accountId: user.id, password: hash },
      });
    }
    await db.workspaceInvite.updateMany({
      where: { workspaceId: workspace.id, email: p.email, acceptedAt: null },
      data: { acceptedAt: new Date(), acceptedUserId: user.id },
    });
    users.push({ id: user.id, name: p.name, role: p.role });
  }
  // The AI teammate
  const agent = await db.user.upsert({
    where: { email: "agent@dopl.invalid" },
    create: { email: "agent@dopl.invalid", name: "Dopl", kind: "AGENT", emailVerified: true },
    update: {},
  });
  await db.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: agent.id } },
    create: { workspaceId: workspace.id, userId: agent.id, role: "MEMBER", status: "ACTIVE" },
    update: {},
  });

  const team = users.filter((u) => u.role !== "GUEST");
  const guest = users.find((u) => u.role === "GUEST");
  let totalItems = 0;

  for (const [pi, spec] of projects.entries()) {
    const lead = team[pi % team.length]!;
    const project = await db.project.create({
      data: {
        workspaceId: workspace.id,
        identifier: spec.identifier,
        name: spec.name,
        color: spec.color,
        leadId: lead.id,
        createdById: lead.id,
        createdAt: daysFromToday(-120 + pi * 3),
      },
    });
    // Channel, members, states, labels
    await db.channel.create({
      data: {
        workspaceId: workspace.id,
        kind: "PROJECT",
        projectId: project.id,
        name: spec.name,
        createdById: lead.id,
      },
    });
    const memberKeys = keysBetween(null, null, projects.length);
    for (const u of team) {
      await db.projectMember.create({
        data: {
          projectId: project.id,
          workspaceId: workspace.id,
          userId: u.id,
          role: u.id === lead.id ? "ADMIN" : "MEMBER",
          sortKey: memberKeys[pi]!,
        },
      });
    }
    if (guest && spec.identifier === "HELP") {
      await db.projectMember.create({
        data: {
          projectId: project.id,
          workspaceId: workspace.id,
          userId: guest.id,
          role: "GUEST",
          sortKey: memberKeys[pi]!,
        },
      });
    }
    const stateKeys = keysBetween(null, null, defaultStates.length);
    await db.workflowState.createMany({
      data: defaultStates.map((s, i) => ({
        projectId: project.id,
        workspaceId: workspace.id,
        name: s.name,
        group: s.group,
        color: s.color,
        isDefault: s.isDefault ?? false,
        sortKey: stateKeys[i]!,
      })),
    });
    const states = await db.workflowState.findMany({ where: { projectId: project.id } });
    const stateByGroup = (g: string) => states.filter((s) => s.group === g);
    const labelKeys = keysBetween(null, null, spec.labels.length);
    await db.label.createMany({
      data: spec.labels.map((l, i) => ({
        workspaceId: workspace.id,
        projectId: project.id,
        name: l.name,
        color: l.color,
        sortKey: labelKeys[i]!,
      })),
    });
    const labels = await db.label.findMany({ where: { projectId: project.id } });

    // Items: every title once, plus variations to reach ~55–65 per project.
    const count = int(55, 65);
    const variations = ["", " (follow-up)", " — part 2", " for the open day", " on staging"];
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const base = spec.titles[i % spec.titles.length]!;
      titles.push(i < spec.titles.length ? base : `${base}${pick(variations.slice(1))}`);
    }
    const sortKeys = keysBetween(null, null, count);

    const items: Prisma.WorkItemCreateManyInput[] = [];
    const itemMeta: Array<{ id: string; group: string; createdAt: Date; stateName: string }> = [];
    for (let i = 0; i < count; i++) {
      const group = weighted<string>([
        ["BACKLOG", 18],
        ["UNSTARTED", 22],
        ["STARTED", 22],
        ["COMPLETED", 30],
        ["CANCELLED", 5],
      ]);
      const state = pick(stateByGroup(group));
      const createdAt = new Date(today.getTime() - int(1, 90) * DAY + int(8, 18) * 3600_000);
      const hasDue = group !== "CANCELLED" && chance(0.6);
      const dueOffset = group === "COMPLETED" ? int(-40, -1) : int(-6, 35);
      const hasStart = hasDue && chance(0.45);
      const startedAt = ["STARTED", "COMPLETED"].includes(group)
        ? new Date(createdAt.getTime() + int(0, 6) * DAY)
        : null;
      const completedAt =
        group === "COMPLETED"
          ? new Date(
              Math.min(
                today.getTime() - DAY,
                (startedAt ?? createdAt).getTime() + int(1, 14) * DAY,
              ),
            )
          : null;
      const id = uuidv7(createdAt.getTime());
      const title = titles[i]!;
      const type = /bug|error|broken|fail|drops|doesn't|isn't|won't|500/i.test(title)
        ? types.find((t) => t.name === "Bug")
        : /phishing|cve|incident|packet loss|iowait/i.test(title)
          ? types.find((t) => t.name === "Incident")
          : /request|needs|new board|extra/i.test(title)
            ? types.find((t) => t.name === "Request")
            : /add |set up|dark mode|export|analytics/i.test(title)
              ? types.find((t) => t.name === "Feature")
              : types.find((t) => t.name === "Task");
      items.push({
        id,
        workspaceId: workspace.id,
        projectId: project.id,
        sequence: i + 1,
        title,
        description: chance(0.55) ? doc(`${title}. ${pick(commentBank)}`) : undefined,
        descriptionText: "",
        stateId: state.id,
        stateGroup: state.group,
        priority: weighted<"URGENT" | "HIGH" | "MEDIUM" | "LOW" | "NONE">([
          ["URGENT", 5],
          ["HIGH", 18],
          ["MEDIUM", 32],
          ["LOW", 25],
          ["NONE", 20],
        ]),
        typeId: type?.id ?? null,
        sortKey: sortKeys[i]!,
        startDate: hasStart ? daysFromToday(dueOffset - int(2, 10)) : null,
        dueDate: hasDue ? daysFromToday(dueOffset) : null,
        estimate: chance(0.3) ? pick([1, 2, 3, 5, 8]) : null,
        createdById: pick(team).id,
        startedAt,
        completedAt,
        createdAt,
        updatedAt: new Date(
          Math.max(createdAt.getTime(), (completedAt ?? startedAt ?? createdAt).getTime()),
        ),
      });
      itemMeta.push({ id, group: state.group, createdAt, stateName: state.name });
    }
    await db.workItem.createMany({ data: items });
    await db.$executeRaw`UPDATE work_items SET "descriptionText" = COALESCE((description->'content'->0->'content'->0->>'text'), '') WHERE "projectId" = ${project.id}::uuid`;
    await db.project.update({ where: { id: project.id }, data: { nextSequence: count + 1 } });

    // Assignees, labels, subscribers
    const assignees: Prisma.WorkItemAssigneeCreateManyInput[] = [];
    const itemLabels: Prisma.WorkItemLabelCreateManyInput[] = [];
    const subscribers: Prisma.WorkItemSubscriberCreateManyInput[] = [];
    for (const [i, item] of items.entries()) {
      const n = weighted<number>([
        [0, 15],
        [1, 60],
        [2, 25],
      ]);
      const chosen = new Set<string>();
      while (chosen.size < n) chosen.add(pick(team).id);
      for (const uid of chosen) {
        assignees.push({ workItemId: item.id!, userId: uid, workspaceId: workspace.id });
        subscribers.push({
          workItemId: item.id!,
          userId: uid,
          workspaceId: workspace.id,
          reason: "ASSIGNEE",
        });
      }
      if (!chosen.has(item.createdById!))
        subscribers.push({
          workItemId: item.id!,
          userId: item.createdById!,
          workspaceId: workspace.id,
          reason: "CREATOR",
        });
      const ln = weighted<number>([
        [0, 25],
        [1, 45],
        [2, 25],
        [3, 5],
      ]);
      const lset = new Set<string>();
      while (lset.size < Math.min(ln, labels.length)) lset.add(pick(labels).id);
      for (const lid of lset)
        itemLabels.push({ workItemId: item.id!, labelId: lid, workspaceId: workspace.id });
      void i;
    }
    await db.workItemAssignee.createMany({ data: assignees });
    await db.workItemLabel.createMany({ data: itemLabels });
    await db.workItemSubscriber.createMany({ data: subscribers, skipDuplicates: true });

    // Sub-items: a few parents with 2–4 children each
    const ids = items.map((it) => it.id!);
    const parents = ids.slice(0, 6);
    let cursor = 6;
    for (const parentId of parents) {
      const kids = ids.slice(cursor, cursor + int(2, 4));
      cursor += kids.length;
      if (kids.length)
        await db.workItem.updateMany({ where: { id: { in: kids } }, data: { parentId } });
    }
    await db.$executeRaw`
      UPDATE work_items p SET
        "childCount" = c.total, "childDoneCount" = c.done
      FROM (
        SELECT "parentId", count(*)::int AS total,
               count(*) FILTER (WHERE "stateGroup" IN ('COMPLETED','CANCELLED'))::int AS done
        FROM work_items WHERE "parentId" IS NOT NULL AND "projectId" = ${project.id}::uuid
        GROUP BY "parentId"
      ) c WHERE p.id = c."parentId"`;

    // Relations (blocks)
    const relations: Prisma.WorkItemRelationCreateManyInput[] = [];
    for (let r = 0; r < 4; r++) {
      const a = pick(ids);
      const b = pick(ids);
      if (a !== b)
        relations.push({
          workspaceId: workspace.id,
          sourceId: a,
          targetId: b,
          type: "BLOCKS",
          createdById: lead.id,
        });
    }
    await db.workItemRelation.createMany({ data: relations, skipDuplicates: true });

    // Comments + activity
    const comments: Prisma.CommentCreateManyInput[] = [];
    const activities: Prisma.ActivityCreateManyInput[] = [];
    for (const [i, meta] of itemMeta.entries()) {
      const item = items[i]!;
      activities.push({
        workspaceId: workspace.id,
        projectId: project.id,
        workItemId: meta.id,
        entityType: "WORK_ITEM",
        entityId: meta.id,
        verb: "created",
        meta: { identifier: `${spec.identifier}-${i + 1}`, title: item.title },
        actorType: "USER",
        actorId: item.createdById!,
        createdAt: meta.createdAt,
      });
      if (meta.group !== "BACKLOG") {
        activities.push({
          workspaceId: workspace.id,
          projectId: project.id,
          workItemId: meta.id,
          entityType: "WORK_ITEM",
          entityId: meta.id,
          verb: "updated",
          field: "state",
          meta: {
            fromName: "Backlog",
            toName: meta.stateName,
            fromGroup: "BACKLOG",
            toGroup: meta.group,
          },
          actorType: "USER",
          actorId: pick(team).id,
          createdAt: new Date(meta.createdAt.getTime() + int(1, 5) * DAY),
        });
      }
      if (chance(0.35)) {
        const n = int(1, 4);
        for (let c = 0; c < n; c++) {
          const text = pick(commentBank);
          comments.push({
            workspaceId: workspace.id,
            projectId: project.id,
            workItemId: meta.id,
            authorId: pick(team).id,
            body: doc(text),
            bodyText: text,
            createdAt: new Date(meta.createdAt.getTime() + (c + 1) * int(3, 30) * 3600_000),
          });
        }
      }
    }
    await db.activity.createMany({ data: activities });
    await db.comment.createMany({ data: comments });
    await db.$executeRaw`
      UPDATE work_items w SET "commentCount" = c.n
      FROM (SELECT "workItemId", count(*)::int AS n FROM comments WHERE "projectId" = ${project.id}::uuid GROUP BY "workItemId") c
      WHERE w.id = c."workItemId"`;
    totalItems += count;
    console.log(`  ${spec.identifier.padEnd(6)} ${count} items, ${comments.length} comments`);
  }

  const requests = await seedIntake(db, {
    workspaceId: workspace.id,
    team,
    guestId: guest?.id ?? null,
    today,
  });
  console.log(`  HELP   ${requests} intake requests, 2 forms`);

  const notes = await seedNotes(db, { workspaceId: workspace.id, today });
  console.log(`  Notes  ${notes} notes`);

  const stats = await seedAnalytics(db, { workspaceId: workspace.id, today });
  console.log(`  Stats  ${stats} daily project snapshots (approximated)`);

  console.log(`\nSeeded "${workspace.name}" (/${workspace.slug}): ${totalItems} work items.`);
  console.log(`Sign in with any of: ${people.map((p) => p.email).join(", ")}`);
  console.log(`Password (dev only): ${DEV_PASSWORD}`);
}

try {
  await main();
} finally {
  await db.$disconnect();
}
