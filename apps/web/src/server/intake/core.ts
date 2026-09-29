import "server-only";
import type { Prisma, TransactionClient } from "@dopl/db";
import { generateToken, hashToken } from "@dopl/shared/crypto";
import { docToPlainText, type PMNode } from "@dopl/shared/rich-text";
import { keyBefore } from "@dopl/shared/sort-keys";
import type { Priority } from "@dopl/shared/schemas/work-item";
import { ConflictError } from "../action-result";
import { queueEmail } from "../email/outbox";
import { env } from "../env";
import type { BaseMutation } from "../mutation";
import { notify } from "../notifications/notify";

/** Status-page links stay valid this long and renew on each visit (D-026). */
export const STATUS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

async function nextIntakeNumber(tx: TransactionClient, projectId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    UPDATE projects SET "nextIntakeNumber" = "nextIntakeNumber" + 1
    WHERE id = ${projectId}::uuid
    RETURNING "nextIntakeNumber" - 1 AS n`;
  const n = rows[0]?.n;
  if (n == null) throw new ConflictError("no_project");
  return Number(n);
}

export interface TriageItemInput {
  project: { id: string; identifier: string; name: string };
  title: string;
  description: PMNode | null;
  priority: Priority;
  typeId: string | null;
  labelIds: string[];
  dueDate: Date | null;
  source: "FORM" | "IN_APP";
  formId?: string | null;
  contactId?: string | null;
  submitterUserId?: string | null;
}

/**
 * A request becomes a work item in the project's hidden TRIAGE state with no
 * number (D-018), plus its IntakeItem. Everything a submitter wrote is
 * untrusted: agent runs that read it are tainted (D-033).
 */
export async function createTriageItem(m: BaseMutation, input: TriageItemInput) {
  const { tx, workspaceId } = m;
  const triage = await tx.workflowState.findFirst({
    where: { projectId: input.project.id, group: "TRIAGE" },
    select: { id: true },
  });
  if (!triage) throw new ConflictError("no_triage_state");
  const number = await nextIntakeNumber(tx, input.project.id);
  const first = await tx.workItem.findFirst({
    where: { projectId: input.project.id },
    orderBy: { sortKey: "asc" },
    select: { sortKey: true },
  });
  const item = await tx.workItem.create({
    data: {
      workspaceId,
      projectId: input.project.id,
      sequence: null,
      title: input.title,
      description: input.description
        ? (input.description as unknown as Prisma.InputJsonValue)
        : undefined,
      descriptionText: docToPlainText(input.description),
      stateId: triage.id,
      stateGroup: "TRIAGE",
      priority: input.priority,
      typeId: input.typeId,
      sortKey: keyBefore(first?.sortKey ?? null),
      dueDate: input.dueDate,
      origin: input.source === "FORM" ? "INTAKE_FORM" : "INTAKE_GUEST",
      untrusted: true,
      createdById: input.submitterUserId ?? null,
      createdByContactId: input.contactId ?? null,
      labels: {
        createMany: { data: input.labelIds.map((labelId) => ({ labelId, workspaceId })) },
      },
    },
    select: { id: true, title: true },
  });
  const intake = await tx.intakeItem.create({
    data: {
      workspaceId,
      projectId: input.project.id,
      number,
      workItemId: item.id,
      status: "PENDING",
      source: input.source,
      formId: input.formId ?? null,
      contactId: input.contactId ?? null,
      submitterUserId: input.submitterUserId ?? null,
    },
    select: { id: true, number: true },
  });
  if (input.submitterUserId) {
    await tx.workItemSubscriber.create({
      data: {
        workItemId: item.id,
        userId: input.submitterUserId,
        workspaceId,
        reason: "CREATOR",
      },
    });
  }
  m.activity({
    entityType: "WORK_ITEM",
    entityId: item.id,
    workItemId: item.id,
    projectId: input.project.id,
    verb: "submitted",
    meta: { intakeNumber: number, source: input.source },
  });
  m.emit({
    topic: `project:${input.project.id}`,
    type: "intake.created",
    payload: { id: intake.id, workItemId: item.id },
  });
  m.webhook({
    event: "intake.submitted",
    entityType: "INTAKE_ITEM",
    entityId: intake.id,
    projectId: input.project.id,
  });
  return { workItemId: item.id, intakeId: intake.id, number, title: item.title };
}

/**
 * Who hears about a new request: the form's notify list, else the project's
 * admins and lead, else the workspace admins. Guests never triage.
 */
export async function triagerIds(
  tx: TransactionClient,
  workspaceId: string,
  projectId: string,
  preferred: string[] = [],
): Promise<string[]> {
  const eligible = (ids: string[]) =>
    tx.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: { in: ids },
        status: "ACTIVE",
        role: { not: "GUEST" },
        user: { kind: "HUMAN" },
      },
      select: { userId: true },
    });
  if (preferred.length) {
    const ok = await eligible(preferred);
    if (ok.length) return ok.map((m) => m.userId);
  }
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { leadId: true, members: { where: { role: "ADMIN" }, select: { userId: true } } },
  });
  const ids = [
    ...(project.leadId ? [project.leadId] : []),
    ...project.members.map((m) => m.userId),
  ];
  const ok = await eligible(ids);
  if (ok.length) return ok.map((m) => m.userId);
  const admins = await tx.workspaceMember.findMany({
    where: {
      workspaceId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
      user: { kind: "HUMAN" },
    },
    select: { userId: true },
  });
  return admins.map((a) => a.userId);
}

export async function notifyTriagers(
  m: BaseMutation,
  args: {
    projectId: string;
    projectIdentifier: string;
    intakeId: string;
    workItemId: string;
    number: number;
    title: string;
    from: string;
    preferred?: string[];
  },
) {
  const recipients = await triagerIds(m.tx, m.workspaceId, args.projectId, args.preferred);
  await notify(m, {
    recipientIds: recipients,
    type: "INTAKE_SUBMITTED",
    entityType: "INTAKE_ITEM",
    entityId: args.intakeId,
    projectId: args.projectId,
    workItemId: args.workItemId,
    data: {
      title: args.title,
      intakeNumber: args.number,
      projectIdentifier: args.projectIdentifier,
      from: args.from,
    },
  });
}

/** A fresh status-page link for a contact; only its hash is stored. */
export async function issueStatusUrl(
  tx: TransactionClient,
  args: { workspaceId: string; contactId: string; intakeItemId: string },
): Promise<string> {
  const token = generateToken();
  await tx.contactAccessToken.create({
    data: {
      workspaceId: args.workspaceId,
      contactId: args.contactId,
      intakeItemId: args.intakeItemId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + STATUS_TOKEN_TTL_MS),
    },
  });
  return `${env.APP_URL}/s/${token}`;
}

type SubmitterEvent =
  | { kind: "accepted" }
  | { kind: "declined"; reason: string }
  | { kind: "duplicate" }
  | { kind: "reply"; authorName: string; excerpt: string };

/**
 * Tells the person who asked. Contacts get an email with a fresh status link;
 * people with an account (guests, members) get an Inbox notification and the
 * same email pointing at their request page. Blocked contacts get nothing.
 */
export async function notifySubmitter(m: BaseMutation, intakeId: string, event: SubmitterEvent) {
  const { tx } = m;
  const intake = await tx.intakeItem.findUniqueOrThrow({
    where: { id: intakeId },
    select: {
      id: true,
      projectId: true,
      workItemId: true,
      contact: { select: { id: true, email: true, blockedAt: true } },
      submitterUser: { select: { id: true, email: true } },
      workItem: { select: { title: true } },
    },
  });
  const ws = await tx.workspace.findUniqueOrThrow({
    where: { id: m.workspaceId },
    select: { name: true, slug: true },
  });
  const title = intake.workItem.title;
  let to: string | null = null;
  let statusUrl: string;
  let contactId: string | null = null;
  let userId: string | null = null;
  if (intake.contact) {
    if (intake.contact.blockedAt) return;
    to = intake.contact.email;
    contactId = intake.contact.id;
    statusUrl = await issueStatusUrl(tx, {
      workspaceId: m.workspaceId,
      contactId: intake.contact.id,
      intakeItemId: intake.id,
    });
  } else if (intake.submitterUser) {
    to = intake.submitterUser.email;
    userId = intake.submitterUser.id;
    statusUrl = `${env.APP_URL}/${ws.slug}/requests/${intake.id}`;
    await notify(m, {
      recipientIds: [intake.submitterUser.id],
      type: event.kind === "reply" ? "COMMENT" : "INTAKE_UPDATED",
      entityType: "INTAKE_ITEM",
      entityId: intake.id,
      projectId: intake.projectId,
      workItemId: intake.workItemId,
      groupKey: `request:${intake.id}`,
      data: {
        title,
        status: event.kind,
        ...(event.kind === "reply" ? { excerpt: event.excerpt } : {}),
      },
    });
  } else return;

  const base = { workspaceName: ws.name, title, statusUrl };
  const common = { to, workspaceId: m.workspaceId, contactId, userId };
  switch (event.kind) {
    case "accepted":
      return queueEmail(tx, { ...common, template: "intake.accepted", data: base });
    case "declined":
      return queueEmail(tx, {
        ...common,
        template: "intake.declined",
        data: { ...base, reason: event.reason },
      });
    case "duplicate":
      return queueEmail(tx, { ...common, template: "intake.duplicate", data: base });
    case "reply":
      return queueEmail(tx, {
        ...common,
        template: "intake.reply",
        data: { ...base, authorName: event.authorName, excerpt: event.excerpt },
      });
  }
}
