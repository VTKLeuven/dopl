import "server-only";
import { ForbiddenError } from "@dopl/shared/policy";
import { uuidv7 } from "@dopl/shared/ids";
import { ConflictError, NotFoundError } from "../action-result";
import { db } from "../db";
import { withMutation } from "../mutation";
import { projectAccessById } from "../queries/projects";
import type { WorkspaceCtx } from "../session";
import { blobStore, MAX_UPLOAD_BYTES } from "../storage";

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";

export async function attachToWorkItem(ctx: WorkspaceCtx, workItemId: string, file: File) {
  if (file.size === 0) throw new ConflictError("empty_file");
  if (file.size > MAX_UPLOAD_BYTES) throw new ConflictError("too_large");
  const item = await db.workItem.findFirst({ where: { id: workItemId, workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, projectId: true } });
  if (!item) throw new NotFoundError();
  const access = await projectAccessById(ctx, item.projectId);
  if (!access.can("workItem.edit")) throw new ForbiddenError();

  const id = uuidv7();
  const filename = safeName(file.name);
  const key = `${ctx.workspace.id}/items/${item.id}/${id}-${filename}`;
  const contentType = file.type || "application/octet-stream";
  await blobStore().put(key, Buffer.from(await file.arrayBuffer()), contentType);

  return withMutation(ctx, async ({ tx, activity, emit }) => {
    const a = await tx.attachment.create({
      data: { id, workspaceId: ctx.workspace.id, storageKey: key, filename, mimeType: contentType, size: file.size, status: "READY", uploadedById: ctx.actor.userId, workItemId: item.id },
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
    });
    await tx.workItem.update({ where: { id: item.id }, data: { attachmentCount: { increment: 1 } } });
    activity({ entityType: "WORK_ITEM", entityId: item.id, workItemId: item.id, projectId: item.projectId, verb: "updated", field: "attachment", toValue: { filename } });
    emit({ topic: `project:${item.projectId}`, type: "workItem.updated", payload: { id: item.id, fields: ["attachmentCount"] } });
    return a;
  });
}

export async function deleteAttachment(ctx: WorkspaceCtx, attachmentId: string) {
  const a = await db.attachment.findFirst({ where: { id: attachmentId, workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, workItemId: true, uploadedById: true, storageKey: true, filename: true } });
  if (!a?.workItemId) throw new NotFoundError();
  const item = await db.workItem.findUniqueOrThrow({ where: { id: a.workItemId }, select: { projectId: true } });
  const access = await projectAccessById(ctx, item.projectId);
  if (!access.can("workItem.edit")) throw new ForbiddenError();
  await withMutation(ctx, async ({ tx, activity }) => {
    await tx.attachment.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    await tx.workItem.update({ where: { id: a.workItemId ?? "" }, data: { attachmentCount: { decrement: 1 } } });
    activity({ entityType: "WORK_ITEM", entityId: a.workItemId ?? "", workItemId: a.workItemId, projectId: item.projectId, verb: "updated", field: "attachment", fromValue: { filename: a.filename } });
  });
  // Bytes are purged with the nightly maintenance job (soft delete → undo window).
}

/** Authorizes a download and returns what the route needs to serve it. */
export async function resolveDownload(ctx: WorkspaceCtx, attachmentId: string) {
  const a = await db.attachment.findFirst({
    where: { id: attachmentId, workspaceId: ctx.workspace.id, deletedAt: null, status: "READY" },
    select: { storageKey: true, filename: true, mimeType: true, workItem: { select: { projectId: true } }, comment: { select: { projectId: true } } },
  });
  const projectId = a?.workItem?.projectId ?? a?.comment?.projectId;
  if (!a || !projectId) throw new NotFoundError();
  const access = await projectAccessById(ctx, projectId);
  if (!access.can("project.view")) throw new NotFoundError();
  return a;
}
