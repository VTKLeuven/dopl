import "server-only";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import { z } from "zod";
import { ConflictError, NotFoundError } from "../action-result";
import { audit, withMutation } from "../mutation";
import type { WorkspaceCtx } from "../session";

export const UpdateContactSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().max(120).nullable().optional(),
  organization: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

function assertCan(ctx: WorkspaceCtx, action: "contact.edit" | "contact.merge") {
  if (!canWorkspace(ctx.policyActor, action)) throw new ForbiddenError();
}

export async function updateContact(ctx: WorkspaceCtx, raw: unknown) {
  assertCan(ctx, "contact.edit");
  const { id, ...patch } = UpdateContactSchema.parse(raw);
  return withMutation(ctx, async (m) => {
    const contact = await m.tx.contact.findFirst({
      where: { id, workspaceId: ctx.workspace.id },
      select: { id: true },
    });
    if (!contact) throw new NotFoundError();
    const data = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, v === "" ? null : v]),
    ) as typeof patch;
    await m.tx.contact.update({ where: { id }, data });
    m.activity({
      entityType: "CONTACT",
      entityId: id,
      verb: "updated",
      meta: { fields: Object.keys(patch) },
    });
    m.emit({ topic: `workspace:${ctx.workspace.id}`, type: "contact.updated", payload: { id } });
    return { id };
  });
}

/**
 * Blocking stops a contact's future submissions (silently dropped) and their
 * status-page links; existing requests stay in the queue.
 */
export async function setContactBlocked(ctx: WorkspaceCtx, id: string, blocked: boolean) {
  assertCan(ctx, "contact.edit");
  return withMutation(ctx, async (m) => {
    const contact = await m.tx.contact.findFirst({
      where: { id: z.uuid().parse(id), workspaceId: ctx.workspace.id },
      select: { id: true, email: true },
    });
    if (!contact) throw new NotFoundError();
    await m.tx.contact.update({ where: { id }, data: { blockedAt: blocked ? new Date() : null } });
    await audit(m.tx, ctx, {
      action: blocked ? "contact.blocked" : "contact.unblocked",
      targetType: "contact",
      targetId: id,
      metadata: { email: contact.email },
    });
    m.activity({ entityType: "CONTACT", entityId: id, verb: blocked ? "blocked" : "unblocked" });
    m.emit({ topic: `workspace:${ctx.workspace.id}`, type: "contact.updated", payload: { id } });
    return { id, blocked };
  });
}

/**
 * Merges a duplicate contact into another: requests, submissions, comments,
 * files, created items, status links and mail move over, then the duplicate
 * is deleted. Empty fields on the target are filled from the duplicate.
 */
export async function mergeContacts(ctx: WorkspaceCtx, raw: unknown) {
  assertCan(ctx, "contact.merge");
  const { sourceId, targetId } = z.object({ sourceId: z.uuid(), targetId: z.uuid() }).parse(raw);
  if (sourceId === targetId) throw new ConflictError("same_contact");
  return withMutation(ctx, async (m) => {
    const { tx } = m;
    const [source, target] = await Promise.all(
      [sourceId, targetId].map((id) =>
        tx.contact.findFirst({ where: { id, workspaceId: ctx.workspace.id } }),
      ),
    );
    if (!source || !target) throw new NotFoundError();
    const move = { where: { contactId: sourceId }, data: { contactId: targetId } };
    await tx.intakeItem.updateMany(move);
    await tx.intakeSubmission.updateMany(move);
    await tx.contactAccessToken.updateMany(move);
    await tx.emailThread.updateMany(move);
    await tx.emailMessage.updateMany(move);
    await tx.comment.updateMany({
      where: { authorContactId: sourceId },
      data: { authorContactId: targetId },
    });
    await tx.attachment.updateMany({
      where: { uploadedByContactId: sourceId },
      data: { uploadedByContactId: targetId },
    });
    await tx.workItem.updateMany({
      where: { createdByContactId: sourceId },
      data: { createdByContactId: targetId },
    });
    await tx.contact.update({
      where: { id: targetId },
      data: {
        name: target.name ?? source.name,
        organization: target.organization ?? source.organization,
        phone: target.phone ?? source.phone,
        notes: [target.notes, source.notes].filter(Boolean).join("\n\n") || null,
        userId: target.userId ?? source.userId,
        lastSeenAt:
          (source.lastSeenAt?.getTime() ?? 0) > (target.lastSeenAt?.getTime() ?? 0)
            ? source.lastSeenAt
            : target.lastSeenAt,
      },
    });
    await tx.contact.delete({ where: { id: sourceId } });
    await audit(tx, ctx, {
      action: "contact.merged",
      targetType: "contact",
      targetId,
      metadata: { from: source.email, into: target.email },
    });
    m.activity({
      entityType: "CONTACT",
      entityId: targetId,
      verb: "merged",
      meta: { from: source.email },
    });
    m.emit({
      topic: `workspace:${ctx.workspace.id}`,
      type: "contact.updated",
      payload: { id: targetId },
    });
    return { id: targetId };
  });
}
