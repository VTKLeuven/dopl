import "server-only";
import type { Prisma } from "@dopl/db";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import { openSecret, sealSecret } from "@dopl/shared/secretbox";
import {
  CreateWebhookSchema,
  isAllowedWebhookUrl,
  UpdateWebhookSchema,
  webhookUrlHint,
  type DeliveryPayload,
} from "@dopl/shared/schemas/webhooks";
import { z } from "zod";
import { ConflictError, NotFoundError } from "../action-result";
import { env } from "../env";
import { enqueue } from "../jobs";
import { audit, withMutation, type Mutation } from "../mutation";
import type { WorkspaceCtx } from "../session";

/** Settings → Integrations (D-052). Admins only; every change is audited. */
function assertAdmin(ctx: WorkspaceCtx) {
  if (!canWorkspace(ctx.policyActor, "workspace.integrations.manage")) throw new ForbiddenError();
}

function checkUrl(url: string) {
  if (!isAllowedWebhookUrl(url, { allowLocal: env.NODE_ENV !== "production" }))
    throw new ConflictError("invalid_webhook_url");
}

async function checkMailboxes(m: Mutation, ids: string[]) {
  if (ids.length === 0) return;
  const n = await m.tx.mailbox.count({
    where: { id: { in: ids }, workspaceId: m.ctx.workspace.id, deletedAt: null },
  });
  if (n !== new Set(ids).size) throw new ConflictError("invalid_mailbox");
}

async function checkProjects(m: Mutation, ids: string[]) {
  if (ids.length === 0) return;
  const n = await m.tx.project.count({
    where: { id: { in: ids }, workspaceId: m.ctx.workspace.id, deletedAt: null },
  });
  if (n !== new Set(ids).size) throw new ConflictError("invalid_project");
}

export async function createWebhook(ctx: WorkspaceCtx, raw: unknown) {
  assertAdmin(ctx);
  const input = CreateWebhookSchema.parse(raw);
  checkUrl(input.url);
  return withMutation(ctx, async (m) => {
    await checkProjects(m, input.projectIds);
    await checkMailboxes(m, input.mailboxIds);
    const hook = await m.tx.outgoingWebhook.create({
      data: {
        workspaceId: ctx.workspace.id,
        kind: "DISCORD",
        name: input.name,
        urlEncrypted: sealSecret(input.url, env.DOPL_ENCRYPTION_KEY),
        urlHint: webhookUrlHint(input.url),
        events: input.events,
        projectIds: input.projectIds,
        mailboxIds: input.mailboxIds,
        includeContent: input.includeContent,
        createdById: ctx.actor.userId,
      },
      select: { id: true },
    });
    await audit(m.tx, ctx, {
      action: "webhook.created",
      targetType: "webhook",
      targetId: hook.id,
      metadata: { name: input.name, events: input.events, includeContent: input.includeContent },
    });
    m.emit({
      topic: `workspace:${ctx.workspace.id}`,
      type: "webhook.updated",
      payload: { id: hook.id },
    });
    return hook;
  });
}

export async function updateWebhook(ctx: WorkspaceCtx, raw: unknown) {
  assertAdmin(ctx);
  const { id, url, ...patch } = UpdateWebhookSchema.parse(raw);
  if (url) checkUrl(url);
  return withMutation(ctx, async (m) => {
    const hook = await m.tx.outgoingWebhook.findFirst({
      where: { id, workspaceId: ctx.workspace.id },
      select: { id: true },
    });
    if (!hook) throw new NotFoundError();
    if (patch.projectIds) await checkProjects(m, patch.projectIds);
    if (patch.mailboxIds) await checkMailboxes(m, patch.mailboxIds);
    await m.tx.outgoingWebhook.update({
      where: { id },
      data: {
        ...patch,
        ...(url
          ? { urlEncrypted: sealSecret(url, env.DOPL_ENCRYPTION_KEY), urlHint: webhookUrlHint(url) }
          : {}),
        // Re-enabling starts a fresh failure count.
        ...(patch.enabled ? { failureCount: 0, disabledReason: null } : {}),
      },
    });
    await audit(m.tx, ctx, {
      action: "webhook.updated",
      targetType: "webhook",
      targetId: id,
      metadata: { fields: [...Object.keys(patch), ...(url ? ["url"] : [])] },
    });
    m.emit({ topic: `workspace:${ctx.workspace.id}`, type: "webhook.updated", payload: { id } });
    return { id };
  });
}

export async function deleteWebhook(ctx: WorkspaceCtx, id: string) {
  assertAdmin(ctx);
  return withMutation(ctx, async (m) => {
    const hook = await m.tx.outgoingWebhook.findFirst({
      where: { id: z.uuid().parse(id), workspaceId: ctx.workspace.id },
      select: { id: true, name: true },
    });
    if (!hook) throw new NotFoundError();
    await m.tx.outgoingWebhook.delete({ where: { id } });
    await audit(m.tx, ctx, {
      action: "webhook.deleted",
      targetType: "webhook",
      targetId: id,
      metadata: { name: hook.name },
    });
    m.emit({ topic: `workspace:${ctx.workspace.id}`, type: "webhook.updated", payload: { id } });
    return { id };
  });
}

/** "Send test message": a delivery with no entity, posted right away. */
export async function sendTestMessage(ctx: WorkspaceCtx, id: string) {
  assertAdmin(ctx);
  return withMutation(ctx, async (m) => {
    const hook = await m.tx.outgoingWebhook.findFirst({
      where: { id: z.uuid().parse(id), workspaceId: ctx.workspace.id },
      select: { id: true },
    });
    if (!hook) throw new NotFoundError();
    const payload: DeliveryPayload = {
      events: [{ type: "work_item.created", at: new Date().toISOString(), detail: {} }],
      test: true,
    };
    const delivery = await m.tx.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        workspaceId: ctx.workspace.id,
        eventType: "test",
        entityType: "WORKSPACE",
        entityId: ctx.workspace.id,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await enqueue(m.tx, "webhook.deliver", { deliveryId: delivery.id });
    return { deliveryId: delivery.id };
  });
}

/** Redeliver posts exactly what was sent before (or renders it anew if it never went out). */
export async function redeliver(ctx: WorkspaceCtx, deliveryId: string) {
  assertAdmin(ctx);
  return withMutation(ctx, async (m) => {
    const old = await m.tx.webhookDelivery.findFirst({
      where: { id: z.uuid().parse(deliveryId), workspaceId: ctx.workspace.id },
    });
    if (!old) throw new NotFoundError();
    const copy = await m.tx.webhookDelivery.create({
      data: {
        webhookId: old.webhookId,
        workspaceId: old.workspaceId,
        eventType: old.eventType,
        entityType: old.entityType,
        entityId: old.entityId,
        payload: old.payload as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await enqueue(m.tx, "webhook.deliver", { deliveryId: copy.id });
    return { deliveryId: copy.id };
  });
}

/** Only for tests and the worker: the stored URL, decrypted. */
export function revealWebhookUrl(sealed: string): string {
  return openSecret(sealed, env.DOPL_ENCRYPTION_KEY);
}
