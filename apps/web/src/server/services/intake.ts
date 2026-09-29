import "server-only";
import type { Prisma } from "@dopl/db";
import { canSeeRequest, ForbiddenError } from "@dopl/shared/policy";
import {
  AcceptIntakeSchema,
  DeclineIntakeSchema,
  DuplicateIntakeSchema,
  GuestRequestSchema,
  SnoozeIntakeSchema,
  type AcceptIntakeInput,
} from "@dopl/shared/schemas/intake";
import { docToPlainText, isEmptyDoc, sanitizeDoc } from "@dopl/shared/rich-text";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { keyBefore } from "@dopl/shared/sort-keys";
import { z } from "zod";
import { ConflictError, NotFoundError } from "../action-result";
import { db } from "../db";
import { createTriageItem, notifySubmitter, notifyTriagers, triagerIds } from "../intake/core";
import { withMutation, type Mutation } from "../mutation";
import { notify } from "../notifications/notify";
import { projectAccessById, type ProjectAccess } from "../queries/projects";
import type { WorkspaceCtx } from "../session";
import { nextSequence, resolveState, subscribe, validAssignees, validLabels } from "./work-items";

/* ───────────────────────── in-app requests ───────────────────────── */

/** A guest's (or member's) request from inside Dopl: lands in the project's triage queue. */
export async function submitRequest(ctx: WorkspaceCtx, raw: unknown) {
  const input = GuestRequestSchema.parse(raw);
  const access = await projectAccessById(ctx, input.projectId);
  if (!access.can("intake.submit")) throw new ForbiddenError();
  const description = input.description ? sanitizeDoc(input.description) : null;
  return withMutation(ctx, async (m) => {
    const settings = await m.tx.project.findUniqueOrThrow({
      where: { id: access.project.id },
      select: { intakeEnabled: true },
    });
    if (!settings.intakeEnabled) throw new ConflictError("intake_disabled");
    const created = await createTriageItem(m, {
      project: access.project,
      title: input.title,
      description: description && !isEmptyDoc(description) ? description : null,
      priority: "NONE",
      typeId: null,
      labelIds: [],
      dueDate: null,
      source: "IN_APP",
      submitterUserId: ctx.actor.userId,
    });
    await notifyTriagers(m, {
      projectId: access.project.id,
      projectIdentifier: access.project.identifier,
      intakeId: created.intakeId,
      workItemId: created.workItemId,
      number: created.number,
      title: created.title,
      from: ctx.actor.name,
    });
    return { id: created.intakeId, number: created.number };
  });
}

/** The submitter follows up on their own request (always a PUBLIC comment). */
export async function replyToRequest(ctx: WorkspaceCtx, raw: unknown) {
  const input = z.object({ id: z.uuid(), body: z.unknown() }).parse(raw);
  const body = sanitizeDoc(input.body);
  if (isEmptyDoc(body)) throw new ConflictError("empty_comment");
  const intake = await loadIntake(ctx, input.id);
  if (!canSeeRequest(ctx.policyActor, intake.access.policy, intake)) throw new NotFoundError();
  if (intake.submitterUserId !== ctx.actor.userId) throw new ForbiddenError();
  return withMutation(ctx, async (m) => {
    const comment = await m.tx.comment.create({
      data: {
        workspaceId: ctx.workspace.id,
        projectId: intake.projectId,
        workItemId: intake.workItemId,
        authorId: ctx.actor.userId,
        visibility: "PUBLIC",
        body: body as unknown as Prisma.InputJsonValue,
        bodyText: docToPlainText(body),
      },
      select: { id: true },
    });
    await m.tx.workItem.update({
      where: { id: intake.workItemId },
      data: { commentCount: { increment: 1 } },
    });
    await notifyTeamOfReply(m, {
      intakeId: intake.id,
      workItemId: intake.workItemId,
      projectId: intake.projectId,
      commentId: comment.id,
      from: ctx.actor.name,
      excerpt: docToPlainText(body, 200),
    });
    m.activity({
      entityType: "WORK_ITEM",
      entityId: intake.workItemId,
      workItemId: intake.workItemId,
      projectId: intake.projectId,
      verb: "commented",
      meta: { commentId: comment.id },
    });
    m.emit({
      topic: `workItem:${intake.workItemId}`,
      type: "comment.created",
      payload: { id: comment.id },
    });
    m.emit({
      topic: `project:${intake.projectId}`,
      type: "intake.updated",
      payload: { id: intake.id },
    });
    return { id: comment.id };
  });
}

/**
 * A submitter replied (guest in-app or contact on the status page): the item's
 * subscribers hear about it; while it's still in triage, so do the triagers.
 */
export async function notifyTeamOfReply(
  m: Parameters<typeof notify>[0],
  args: {
    intakeId: string;
    workItemId: string;
    projectId: string;
    commentId: string;
    from: string;
    excerpt: string;
  },
) {
  const { tx } = m;
  const [intake, subscribers] = await Promise.all([
    tx.intakeItem.findUniqueOrThrow({
      where: { id: args.intakeId },
      select: {
        number: true,
        status: true,
        submitterUserId: true,
        workItem: { select: { title: true, sequence: true } },
        project: { select: { identifier: true } },
      },
    }),
    tx.workItemSubscriber.findMany({
      where: { workItemId: args.workItemId, muted: false },
      select: { userId: true },
    }),
  ]);
  const recipients = new Set(
    subscribers.map((s) => s.userId).filter((id) => id !== intake.submitterUserId),
  );
  if (intake.status === "PENDING")
    for (const id of await triagerIds(tx, m.workspaceId, args.projectId)) recipients.add(id);
  await notify(m, {
    recipientIds: [...recipients],
    type: "INTAKE_REPLY",
    entityType: "COMMENT",
    entityId: args.commentId,
    projectId: args.projectId,
    workItemId: args.workItemId,
    groupKey: `intake:${args.intakeId}:reply`,
    data: {
      title: intake.workItem.title,
      identifier: formatIdentifier(
        intake.project.identifier,
        intake.workItem.sequence,
        intake.number,
      ),
      from: args.from,
      excerpt: args.excerpt,
    },
  });
}

/* ───────────────────────── triage ───────────────────────── */

async function loadIntake(ctx: WorkspaceCtx, id: string) {
  const intake = await db.intakeItem.findFirst({
    where: { id, workspaceId: ctx.workspace.id, workItem: { deletedAt: null } },
    select: {
      id: true,
      number: true,
      status: true,
      projectId: true,
      workItemId: true,
      submitterUserId: true,
      snoozedUntil: true,
    },
  });
  if (!intake) throw new NotFoundError();
  const access = await projectAccessById(ctx, intake.projectId);
  return { ...intake, access };
}

async function loadForTriage(m: Mutation, id: string) {
  const intake = await m.tx.intakeItem.findFirst({
    where: { id, workspaceId: m.ctx.workspace.id, workItem: { deletedAt: null } },
    select: {
      id: true,
      number: true,
      status: true,
      projectId: true,
      workItemId: true,
      workItem: {
        select: { id: true, title: true, priority: true, labels: { select: { labelId: true } } },
      },
    },
  });
  if (!intake) throw new NotFoundError();
  const access = await projectAccessById(m.ctx, intake.projectId);
  if (!access.can("intake.triage")) throw new ForbiddenError();
  return { intake, access };
}

function recordDecision(
  m: Mutation,
  access: ProjectAccess,
  intake: { id: string; number: number; workItemId: string; projectId: string },
  decision: string,
  meta: Prisma.InputJsonObject = {},
) {
  m.activity({
    entityType: "WORK_ITEM",
    entityId: intake.workItemId,
    workItemId: intake.workItemId,
    projectId: intake.projectId,
    verb: "triaged",
    meta: { decision, intakeNumber: intake.number, ...meta },
  });
  m.emit({
    topic: `project:${access.project.id}`,
    type: "intake.updated",
    payload: { id: intake.id, workItemId: intake.workItemId },
  });
  m.emit({
    topic: `workItem:${intake.workItemId}`,
    type: "intake.updated",
    payload: { id: intake.id },
  });
}

/**
 * Accept: the request becomes a normal work item. It gets the next number now
 * (declined spam never burns numbers, D-018), a real state, and optionally
 * assignees, labels and a priority. The submitter is told.
 */
export async function acceptIntake(ctx: WorkspaceCtx, raw: AcceptIntakeInput) {
  const input = AcceptIntakeSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    const { intake, access } = await loadForTriage(m, input.id);
    if (intake.status !== "PENDING") throw new ConflictError("already_triaged");
    const projectId = access.project.id;
    const state = await resolveState(tx, projectId, input.stateId);
    const assignees = await validAssignees(tx, ctx, input.assigneeIds ?? []);
    const labels =
      input.labelIds === undefined ? null : await validLabels(tx, ctx, projectId, input.labelIds);
    const sequence = await nextSequence(tx, projectId);
    const first = await tx.workItem.findFirst({
      where: { projectId, stateGroup: { not: "TRIAGE" } },
      orderBy: { sortKey: "asc" },
      select: { sortKey: true },
    });
    const now = new Date();
    if (labels) await tx.workItemLabel.deleteMany({ where: { workItemId: intake.workItemId } });
    await tx.workItem.update({
      where: { id: intake.workItemId },
      data: {
        sequence,
        stateId: state.id,
        stateGroup: state.group,
        sortKey: keyBefore(first?.sortKey ?? null),
        ...(input.priority ? { priority: input.priority } : {}),
        startedAt: state.group === "STARTED" ? now : null,
        completedAt: state.group === "COMPLETED" ? now : null,
        assignees: {
          createMany: {
            data: assignees.map((a) => ({
              userId: a.id,
              workspaceId: ctx.workspace.id,
              assignedById: ctx.actor.userId,
            })),
            skipDuplicates: true,
          },
        },
        ...(labels
          ? {
              labels: {
                createMany: {
                  data: labels.map((l) => ({ labelId: l.id, workspaceId: ctx.workspace.id })),
                },
              },
            }
          : {}),
      },
    });
    await tx.intakeItem.update({
      where: { id: intake.id },
      data: {
        status: "ACCEPTED",
        triagedById: ctx.actor.userId,
        triagedAt: now,
        snoozedUntil: null,
      },
    });
    await subscribe(tx, ctx, intake.workItemId, ctx.actor.userId, "MANUAL");
    for (const a of assignees) await subscribe(tx, ctx, intake.workItemId, a.id, "ASSIGNEE");
    const identifier = formatIdentifier(access.project.identifier, sequence);
    await notify(m, {
      recipientIds: assignees.map((a) => a.id),
      type: "ASSIGNED",
      entityType: "WORK_ITEM",
      entityId: intake.workItemId,
      workItemId: intake.workItemId,
      projectId,
      groupKey: `workItem:${intake.workItemId}:ASSIGNED`,
      data: { identifier, title: intake.workItem.title },
    });
    recordDecision(m, access, intake, "accepted", { identifier, stateName: state.name });
    m.emit({
      topic: `project:${projectId}`,
      type: "workItem.created",
      payload: { id: intake.workItemId },
    });
    m.webhook({
      event: "intake.accepted",
      entityType: "INTAKE_ITEM",
      entityId: intake.id,
      projectId,
    });
    await notifySubmitter(m, intake.id, { kind: "accepted" });
    return { id: intake.id, workItemId: intake.workItemId, identifier };
  });
}

/** Decline: the item stays hidden in TRIAGE (reachable from the Declined tab). */
export async function declineIntake(ctx: WorkspaceCtx, raw: unknown) {
  const input = DeclineIntakeSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { intake, access } = await loadForTriage(m, input.id);
    if (intake.status !== "PENDING") throw new ConflictError("already_triaged");
    await m.tx.intakeItem.update({
      where: { id: intake.id },
      data: {
        status: "DECLINED",
        declineReason: input.reason || null,
        triagedById: ctx.actor.userId,
        triagedAt: new Date(),
        snoozedUntil: null,
      },
    });
    recordDecision(m, access, intake, "declined", { reason: input.reason });
    if (input.notify)
      await notifySubmitter(m, intake.id, { kind: "declined", reason: input.reason });
    return { id: intake.id };
  });
}

/** Duplicate: points at the existing item; the submitter is told it's already tracked. */
export async function markDuplicate(ctx: WorkspaceCtx, raw: unknown) {
  const input = DuplicateIntakeSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const { intake, access } = await loadForTriage(m, input.id);
    if (intake.status !== "PENDING") throw new ConflictError("already_triaged");
    const original = await m.tx.workItem.findFirst({
      where: {
        id: input.duplicateOfId,
        workspaceId: ctx.workspace.id,
        deletedAt: null,
        stateGroup: { not: "TRIAGE" },
      },
      select: {
        id: true,
        projectId: true,
        sequence: true,
        project: { select: { identifier: true } },
      },
    });
    if (!original || original.id === intake.workItemId)
      throw new ConflictError("invalid_duplicate");
    const target = await projectAccessById(ctx, original.projectId);
    if (!target.can("project.view")) throw new NotFoundError();
    await m.tx.intakeItem.update({
      where: { id: intake.id },
      data: {
        status: "DUPLICATE",
        duplicateOfId: original.id,
        triagedById: ctx.actor.userId,
        triagedAt: new Date(),
        snoozedUntil: null,
      },
    });
    const identifier = formatIdentifier(original.project.identifier, original.sequence);
    recordDecision(m, access, intake, "duplicate", { of: identifier });
    m.activity({
      entityType: "WORK_ITEM",
      entityId: original.id,
      workItemId: original.id,
      projectId: original.projectId,
      verb: "duplicated",
      meta: { intakeNumber: intake.number, projectIdentifier: access.project.identifier },
    });
    if (input.notify) await notifySubmitter(m, intake.id, { kind: "duplicate" });
    return { id: intake.id, duplicateOf: identifier };
  });
}

/** Snooze until a moment (or wake now with `until: null`). */
export async function snoozeIntake(ctx: WorkspaceCtx, raw: unknown) {
  const input = SnoozeIntakeSchema.parse(raw);
  const until = input.until ? new Date(input.until) : null;
  if (until && until.getTime() <= Date.now()) throw new ConflictError("snooze_in_past");
  return withMutation(ctx, async (m) => {
    const { intake, access } = await loadForTriage(m, input.id);
    if (intake.status !== "PENDING") throw new ConflictError("already_triaged");
    await m.tx.intakeItem.update({ where: { id: intake.id }, data: { snoozedUntil: until } });
    recordDecision(m, access, intake, until ? "snoozed" : "unsnoozed", {
      until: until?.toISOString() ?? null,
    });
    return { id: intake.id, snoozedUntil: until?.toISOString() ?? null };
  });
}

/** Undo a decline or duplicate: back to Pending. Accepted items can't go back. */
export async function reopenIntake(ctx: WorkspaceCtx, id: string) {
  return withMutation(ctx, async (m) => {
    const { intake, access } = await loadForTriage(m, z.uuid().parse(id));
    if (intake.status !== "DECLINED" && intake.status !== "DUPLICATE")
      throw new ConflictError("not_closed");
    await m.tx.intakeItem.update({
      where: { id: intake.id },
      data: {
        status: "PENDING",
        declineReason: null,
        duplicateOfId: null,
        triagedById: null,
        triagedAt: null,
      },
    });
    recordDecision(m, access, intake, "reopened");
    return { id: intake.id };
  });
}
