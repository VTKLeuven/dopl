"use server";

import { run } from "../action-result";
import { requireWorkspaceCtx } from "../session";
import { deleteAttachment } from "../services/attachments";

export async function deleteAttachmentAction(ws: string, attachmentId: string) {
  const ctx = await requireWorkspaceCtx(ws);
  return run(() => deleteAttachment(ctx, attachmentId));
}
