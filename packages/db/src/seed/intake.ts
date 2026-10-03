/**
 * Intake seed (Phase 3): contacts, a published IT-support form and a draft
 * form, and requests in every triage state, with public replies, a contact's
 * reply and an internal note. Deterministic: fixed texts, dates relative to
 * today. Called from ./index.ts after the projects exist.
 */
import { keysBetween } from "@dopl/shared/sort-keys";
import { uuidv7 } from "@dopl/shared/ids";
import type { DbClient } from "../client";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const doc = (text: string) => ({
  type: "doc",
  content: text
    .split("\n\n")
    .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
});

const contacts = [
  {
    email: "lotte.peeters@student.example.test",
    name: "Lotte Peeters",
    organization: "VTK Cultuur",
  },
  { email: "jonas.maes@example.test", name: "Jonas Maes", organization: "Faculty of Engineering" },
  { email: "sara.claes@example.test", name: "Sara Claes", organization: "VTK Sport" },
  { email: "wout.jacobs@example.test", name: "Wout Jacobs", organization: null },
  {
    email: "noor.wouters@student.example.test",
    name: "Noor Wouters",
    organization: "VTK Onderwijs",
  },
  { email: "arne.goossens@example.test", name: null, organization: null },
  { email: "helpdesk-bot@spam.example.test", name: "Free Offers", organization: null },
];

const categories = [
  { value: "account", label: "Account or password" },
  { value: "wifi", label: "Wi-Fi or network" },
  { value: "printer", label: "Printer" },
  { value: "laptop", label: "Laptop or PC" },
  { value: "room", label: "Meeting room or projector" },
  { value: "other", label: "Something else" },
];
const urgencies = [
  { value: "URGENT", label: "Urgent: I can't work" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Normal" },
  { value: "LOW", label: "Whenever you can" },
];

const fields = [
  {
    key: "summary",
    label: "Summary",
    type: "SHORT_TEXT" as const,
    required: true,
    placeholder: "What do you need help with?",
    target: "TITLE" as const,
    options: [],
  },
  {
    key: "category",
    label: "Category",
    type: "SELECT" as const,
    required: true,
    target: "NONE" as const,
    options: categories,
  },
  {
    key: "urgency",
    label: "How urgent is it?",
    type: "SELECT" as const,
    required: false,
    target: "PRIORITY" as const,
    options: urgencies,
  },
  {
    key: "details",
    label: "Details",
    type: "LONG_TEXT" as const,
    required: false,
    helpText: "Steps to reproduce, error messages, what you expected to happen.",
    target: "DESCRIPTION" as const,
    options: [],
  },
  {
    key: "room",
    label: "Room or location",
    type: "SHORT_TEXT" as const,
    required: false,
    placeholder: "e.g. 2.14 or the library",
    target: "NONE" as const,
    options: [],
  },
  {
    key: "attachments",
    label: "Screenshots or files",
    type: "FILE" as const,
    required: false,
    target: "NONE" as const,
    options: [],
  },
];

type Status = "PENDING" | "SNOOZED" | "ACCEPTED" | "DECLINED" | "DUPLICATE";
interface Req {
  title: string;
  contact?: number;
  guest?: boolean;
  category: string;
  urgency: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  room?: string;
  details: string;
  status: Status;
  hoursAgo: number;
  state?: string;
  reason?: string;
  thread?: Array<{ by: "team" | "contact" | "internal"; text: string; hoursAfter: number }>;
}

const requests: Req[] = [
  {
    title: "Can't connect to eduroam in the library",
    contact: 0,
    category: "wifi",
    urgency: "HIGH",
    room: "Library, 2nd floor",
    details:
      "Since this morning my laptop says 'Unable to join the network'. My phone connects fine.\n\nI'm on Windows 11, I already forgot the network and tried again.",
    status: "PENDING",
    hoursAgo: 2,
  },
  {
    title: "Printer in room 2.14 prints blank pages",
    contact: 1,
    category: "printer",
    urgency: "MEDIUM",
    room: "2.14",
    details: "Every page comes out blank, the test page too. The display shows no errors.",
    status: "PENDING",
    hoursAgo: 5,
    thread: [
      {
        by: "team",
        text: "Thanks Jonas, we'll check the toner and the drum this afternoon.",
        hoursAfter: 1,
      },
      { by: "contact", text: "Great, it's the one next to the window.", hoursAfter: 2 },
      {
        by: "internal",
        text: "Probably the drum again, same as last month. Spare is in the storage room.",
        hoursAfter: 3,
      },
    ],
  },
  {
    title: "Need access to the shared drive for the open day team",
    contact: 2,
    category: "account",
    urgency: "MEDIUM",
    details: "Five people from VTK Sport need read/write access to the Open Day 2026 folder.",
    status: "PENDING",
    hoursAgo: 20,
  },
  {
    title: "Projector in auditorium A keeps flickering",
    contact: 3,
    category: "room",
    urgency: "HIGH",
    room: "Auditorium A",
    details: "It flickers every few seconds with HDMI. Lecture at 14:00 tomorrow.",
    status: "PENDING",
    hoursAgo: 26,
    thread: [
      {
        by: "internal",
        text: "Could be the HDMI extender. Check before tomorrow 13:00.",
        hoursAfter: 2,
      },
    ],
  },
  {
    title: "Laptop fan is very loud after the latest update",
    contact: 4,
    category: "laptop",
    urgency: "LOW",
    details: "Not urgent, but it runs at full speed even when idle.",
    status: "PENDING",
    hoursAgo: 49,
  },
  {
    title: "Password reset email never arrives",
    contact: 5,
    category: "account",
    urgency: "URGENT",
    details:
      "I requested a reset three times. Nothing in spam either. I can't hand in my assignment.",
    status: "PENDING",
    hoursAgo: 1,
  },
  {
    title: "Guest Wi-Fi accounts for visitors on Friday",
    guest: true,
    category: "wifi",
    urgency: "MEDIUM",
    details:
      "We have 12 visitors from a partner company on Friday. Could we get guest Wi-Fi codes?",
    status: "PENDING",
    hoursAgo: 8,
  },
  {
    title: "Extra monitor for the new board member's desk",
    contact: 2,
    category: "laptop",
    urgency: "LOW",
    details: "Starts next month, desk 3 in the board room.",
    status: "SNOOZED",
    hoursAgo: 30,
  },
  {
    title: "Meeting room display shows the wrong calendar",
    contact: 1,
    category: "room",
    urgency: "MEDIUM",
    room: "Board room",
    details: "It shows the agenda of the small meeting room instead.",
    status: "ACCEPTED",
    state: "Todo",
    hoursAgo: 72,
    thread: [
      {
        by: "team",
        text: "Accepted, we'll re-pair the display with the right resource this week.",
        hoursAfter: 4,
      },
    ],
  },
  {
    title: "VPN disconnects every 10 minutes",
    contact: 0,
    category: "wifi",
    urgency: "HIGH",
    details: "Happens on both home Wi-Fi and 4G. Log attached in a previous mail.",
    status: "ACCEPTED",
    state: "In progress",
    hoursAgo: 96,
  },
  {
    title: "Please install games on the lab PCs",
    contact: 6,
    category: "other",
    urgency: "LOW",
    details: "For the break room, students would love it!!!",
    status: "DECLINED",
    reason: "The lab PCs are for course software only, so we can't install games on them.",
    hoursAgo: 120,
  },
  {
    title: "eduroam not working on the 3rd floor",
    contact: 4,
    category: "wifi",
    urgency: "MEDIUM",
    details: "Same problem as colleagues are reporting.",
    status: "DUPLICATE",
    hoursAgo: 3,
  },
];

export async function seedIntake(
  db: DbClient,
  opts: {
    workspaceId: string;
    team: Array<{ id: string; name: string }>;
    guestId: string | null;
    today: Date;
  },
): Promise<number> {
  const { workspaceId, team, guestId } = opts;
  const now = Date.now();
  const help = await db.project.findFirst({
    where: { workspaceId, identifier: "HELP" },
    include: { states: true },
  });
  const infra = await db.project.findFirst({ where: { workspaceId, identifier: "INFRA" } });
  if (!help || !infra) return 0;
  const lead = team.find((u) => u.id === help.leadId) ?? team[0]!;
  const requestType = await db.workItemType.findFirst({ where: { workspaceId, name: "Request" } });

  const contactIds: string[] = [];
  for (const c of contacts) {
    const row = await db.contact.upsert({
      where: { workspaceId_emailNormalized: { workspaceId, emailNormalized: c.email } },
      create: {
        workspaceId,
        email: c.email,
        emailNormalized: c.email,
        name: c.name,
        organization: c.organization,
        firstSource: "INTAKE_FORM",
        lastSeenAt: new Date(now - DAY),
        blockedAt: c.email.includes("spam") ? new Date(now - 4 * DAY) : null,
      },
      update: {},
    });
    contactIds.push(row.id);
  }

  const settings = {
    successMessage: "Thanks! The IT team usually replies within one working day.",
    defaults: { typeId: requestType?.id ?? null, priority: "NONE", labelIds: [] },
    notifyUserIds: [],
    turnstileEnabled: false,
    allowedEmbedOrigins: [],
    maxFileSizeMb: 10,
    maxFiles: 5,
    allowedMimeTypes: [],
    showOnFeedbackPage: false,
  };
  const keys = keysBetween(null, null, fields.length);
  const form = await db.intakeForm.create({
    data: {
      workspaceId,
      projectId: help.id,
      slug: "it-support",
      title: "IT support",
      description: doc(
        "Something broken, missing or slow? Tell the VTK IT team. You'll get an email with a link to follow your request.",
      ),
      isPublished: true,
      settings: { ...settings, showOnFeedbackPage: true },
      theme: { buttonText: "IT help", position: "bottom-right" },
      createdById: lead.id,
      fields: {
        createMany: {
          data: fields.map((f, i) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            helpText: "helpText" in f ? f.helpText : null,
            placeholder: "placeholder" in f ? f.placeholder : null,
            options: f.options,
            target: f.target,
            sortKey: keys[i]!,
          })),
        },
      },
    },
  });
  await db.intakeForm.create({
    data: {
      workspaceId,
      projectId: infra.id,
      slug: "infra-server-request",
      title: "Server or VM request",
      isPublished: false,
      settings: { ...settings, successMessage: "" },
      theme: { buttonText: "Request a server", position: "bottom-right" },
      createdById: lead.id,
      fields: {
        createMany: {
          data: fields.slice(0, 4).map((f, i) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            options: f.options,
            target: f.target,
            sortKey: keys[i]!,
          })),
        },
      },
    },
  });

  const triage = help.states.find((s) => s.group === "TRIAGE")!;
  const stateByName = (name: string) => help.states.find((s) => s.name === name)!;
  const original = await db.workItem.findFirst({
    where: { projectId: help.id, sequence: { not: null } },
    orderBy: { sequence: "asc" },
  });
  const firstKey = await db.workItem.findFirst({
    where: { projectId: help.id },
    orderBy: { sortKey: "asc" },
    select: { sortKey: true },
  });
  const sortKeys = keysBetween(null, firstKey?.sortKey ?? null, requests.length);
  let nextSequence = help.nextSequence;
  let number = help.nextIntakeNumber;
  const snapshot = fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    target: f.target,
    options: f.options,
  }));

  for (const [i, r] of requests.entries()) {
    const createdAt = new Date(now - r.hoursAgo * HOUR);
    const accepted = r.status === "ACCEPTED";
    const state = accepted ? stateByName(r.state ?? "Backlog") : triage;
    const workItemId = uuidv7(createdAt.getTime());
    const contactId = r.guest ? null : contactIds[r.contact ?? 0]!;
    const assignee = team[(i + 1) % team.length]!;
    await db.workItem.create({
      data: {
        id: workItemId,
        workspaceId,
        projectId: help.id,
        sequence: accepted ? nextSequence++ : null,
        title: r.title,
        description: doc(r.details),
        descriptionText: r.details,
        stateId: state.id,
        stateGroup: state.group,
        priority: r.urgency,
        typeId: requestType?.id ?? null,
        sortKey: sortKeys[i]!,
        origin: r.guest ? "INTAKE_GUEST" : "INTAKE_FORM",
        untrusted: true,
        createdById: r.guest ? guestId : null,
        createdByContactId: contactId,
        startedAt: state.group === "STARTED" ? new Date(createdAt.getTime() + 6 * HOUR) : null,
        createdAt,
        updatedAt: createdAt,
        ...(accepted
          ? {
              assignees: {
                create: { userId: assignee.id, workspaceId, assignedById: lead.id },
              },
            }
          : {}),
      },
    });
    const triaged = r.status !== "PENDING" && r.status !== "SNOOZED";
    const intake = await db.intakeItem.create({
      data: {
        workspaceId,
        projectId: help.id,
        number: number++,
        workItemId,
        status: r.status === "SNOOZED" ? "PENDING" : r.status,
        source: r.guest ? "IN_APP" : "FORM",
        formId: r.guest ? null : form.id,
        contactId,
        submitterUserId: r.guest ? guestId : null,
        snoozedUntil: r.status === "SNOOZED" ? new Date(now + 3 * DAY) : null,
        duplicateOfId: r.status === "DUPLICATE" ? (original?.id ?? null) : null,
        declineReason: r.reason ?? null,
        triagedById: triaged ? lead.id : null,
        triagedAt: triaged ? new Date(createdAt.getTime() + 2 * HOUR) : null,
        createdAt,
      },
    });
    if (!r.guest)
      await db.intakeSubmission.create({
        data: {
          workspaceId,
          formId: form.id,
          intakeItemId: intake.id,
          contactId,
          clientSubmissionId: `seed-${intake.id}`,
          values: {
            summary: r.title,
            category: r.category,
            urgency: r.urgency,
            details: r.details,
            ...(r.room ? { room: r.room } : {}),
          },
          fieldSnapshot: snapshot,
          spamSignals: { fillMs: 45_000 },
          createdAt,
        },
      });
    const subscribers = [
      ...(accepted ? [{ userId: assignee.id, reason: "ASSIGNEE" as const }] : []),
      ...(triaged ? [{ userId: lead.id, reason: "MANUAL" as const }] : []),
      ...(r.guest && guestId ? [{ userId: guestId, reason: "CREATOR" as const }] : []),
    ];
    await db.workItemSubscriber.createMany({
      data: subscribers.map((s) => ({ ...s, workItemId, workspaceId })),
      skipDuplicates: true,
    });
    await db.activity.create({
      data: {
        workspaceId,
        projectId: help.id,
        workItemId,
        entityType: "WORK_ITEM",
        entityId: workItemId,
        verb: "submitted",
        meta: { intakeNumber: intake.number, source: r.guest ? "IN_APP" : "FORM" },
        actorType: r.guest ? "USER" : "CONTACT",
        actorId: r.guest ? guestId : null,
        actorContactId: contactId,
        createdAt,
      },
    });
    if (triaged)
      await db.activity.create({
        data: {
          workspaceId,
          projectId: help.id,
          workItemId,
          entityType: "WORK_ITEM",
          entityId: workItemId,
          verb: "triaged",
          meta: { decision: r.status.toLowerCase(), intakeNumber: intake.number },
          actorType: "USER",
          actorId: lead.id,
          createdAt: new Date(createdAt.getTime() + 2 * HOUR),
        },
      });
    for (const c of r.thread ?? []) {
      await db.comment.create({
        data: {
          workspaceId,
          projectId: help.id,
          workItemId,
          authorId: c.by === "contact" ? null : lead.id,
          authorContactId: c.by === "contact" ? contactId : null,
          visibility: c.by === "internal" ? "INTERNAL" : "PUBLIC",
          body: doc(c.text),
          bodyText: c.text,
          createdAt: new Date(createdAt.getTime() + c.hoursAfter * HOUR),
        },
      });
    }
    if (r.thread?.length)
      await db.workItem.update({
        where: { id: workItemId },
        data: { commentCount: r.thread.length },
      });
  }
  await db.project.update({
    where: { id: help.id },
    data: { nextSequence, nextIntakeNumber: number },
  });
  return requests.length;
}
