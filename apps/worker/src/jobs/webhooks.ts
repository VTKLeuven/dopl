import type { PgBoss } from "pg-boss";
import type { Logger } from "pino";
import type { DbClient, Prisma } from "@dopl/db";
import { renderDiscordMessage, type DiscordEntity } from "@dopl/shared/discord";
import { openSecret } from "@dopl/shared/secretbox";
import {
  AUTO_DISABLE_AFTER,
  DeliveryPayloadSchema,
  type DeliveryPayload,
} from "@dopl/shared/schemas/webhooks";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import { notifyFromJob } from "../realtime";

export interface DeliverDeps {
  db: DbClient;
  boss: Pick<PgBoss, "send">;
  logger: Logger;
  appUrl: string;
  encryptionKey: string;
  fetch?: typeof fetch;
  /** Attempt number from pg-boss (0-based); after the last one a failure is final. */
  retryCount?: number;
  retryLimit?: number;
}

export type DeliverOutcome = "sent" | "skipped" | "dropped" | "rescheduled" | "failed" | "retry";

const SOURCE_LABEL: Record<string, string> = {
  FORM: "Form",
  IN_APP: "In app",
  EMAIL: "Email",
  API: "API",
};

/** Loads what the message shows, as it is now (coalesced updates show the latest state). */
async function loadEntity(
  db: DbClient,
  appUrl: string,
  slug: string,
  entityType: string,
  entityId: string,
): Promise<DiscordEntity | null> {
  const itemSelect = {
    id: true,
    title: true,
    sequence: true,
    priority: true,
    descriptionText: true,
    deletedAt: true,
    project: { select: { identifier: true, name: true } },
    state: { select: { name: true, group: true } },
    assignees: { select: { user: { select: { name: true } } } },
  } satisfies Prisma.WorkItemSelect;

  if (entityType === "WORK_ITEM") {
    const item = await db.workItem.findUnique({ where: { id: entityId }, select: itemSelect });
    if (!item || item.deletedAt || item.sequence == null) return null;
    const identifier = formatIdentifier(item.project.identifier, item.sequence);
    return {
      kind: "work_item",
      identifier,
      title: item.title,
      url: `${appUrl}/${slug}/i/${identifier}`,
      projectName: item.project.name,
      stateName: item.state.name,
      stateGroup: item.state.group,
      priority: item.priority,
      assignees: item.assignees.map((a) => a.user.name),
      description: item.descriptionText,
    };
  }
  if (entityType === "INTAKE_ITEM") {
    const intake = await db.intakeItem.findUnique({
      where: { id: entityId },
      select: {
        id: true,
        number: true,
        source: true,
        form: { select: { title: true } },
        contact: { select: { name: true, email: true } },
        submitterUser: { select: { name: true } },
        workItem: { select: itemSelect },
      },
    });
    if (!intake || intake.workItem.deletedAt) return null;
    const item = intake.workItem;
    const identifier = formatIdentifier(item.project.identifier, item.sequence, intake.number);
    const url =
      item.sequence != null
        ? `${appUrl}/${slug}/i/${identifier}`
        : `${appUrl}/${slug}/p/${item.project.identifier}/intake?peek=${intake.id}`;
    const submitter = intake.contact
      ? intake.contact.name
        ? `${intake.contact.name} <${intake.contact.email}>`
        : intake.contact.email
      : (intake.submitterUser?.name ?? null);
    return {
      kind: "intake",
      identifier,
      title: item.title,
      url,
      projectName: item.project.name,
      stateName: item.sequence != null ? item.state.name : null,
      stateGroup: item.state.group,
      priority: item.priority,
      assignees: item.assignees.map((a) => a.user.name),
      description: item.descriptionText,
      submitter,
      source: intake.form?.title ?? SOURCE_LABEL[intake.source] ?? null,
    };
  }
  return null;
}

function retryAfterMs(res: Response, body: unknown): number {
  const fromBody =
    body && typeof body === "object" && "retry_after" in body
      ? Number((body as { retry_after: unknown }).retry_after)
      : NaN;
  const fromHeader = Number(res.headers.get("retry-after"));
  const seconds = Number.isFinite(fromBody)
    ? fromBody
    : Number.isFinite(fromHeader)
      ? fromHeader
      : 5;
  return Math.min(Math.max(seconds, 0.5), 3600) * 1000 + 250;
}

/**
 * Posts one delivery to Discord (D-052). 2xx → SENT. 429 → wait `retry_after`
 * and try again (not a failure). Other errors count towards auto-disable
 * (10 in a row), and retry with backoff unless Discord rejected the request
 * itself (4xx), which retrying can't fix.
 */
export async function deliverWebhook(
  deliveryId: string,
  deps: DeliverDeps,
): Promise<DeliverOutcome> {
  const { db, logger } = deps;
  const doFetch = deps.fetch ?? fetch;
  const d = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      webhook: true,
    },
  });
  if (!d || d.status !== "PENDING") return "skipped";
  if (!d.webhook.enabled) {
    await db.webhookDelivery.update({ where: { id: d.id }, data: { status: "DROPPED" } });
    return "dropped";
  }
  if (d.notBefore.getTime() > Date.now() + 1_000) {
    await deps.boss.send("webhook.deliver", { deliveryId }, { startAfter: d.notBefore });
    return "rescheduled";
  }

  const payload: DeliveryPayload = DeliveryPayloadSchema.parse(d.payload);
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: d.workspaceId },
    select: { name: true, slug: true },
  });
  let message = payload.rendered;
  if (!message) {
    const entity = payload.test
      ? null
      : await loadEntity(db, deps.appUrl, workspace.slug, d.entityType, d.entityId);
    if (!entity && !payload.test) {
      await db.webhookDelivery.update({
        where: { id: d.id },
        data: { status: "DROPPED", error: "entity_gone" },
      });
      return "dropped";
    }
    message = renderDiscordMessage({
      appUrl: deps.appUrl,
      workspaceName: workspace.name,
      events: payload.events,
      entity,
      includeContent: d.webhook.includeContent,
      test: payload.test,
    });
  }

  let res: Response | null = null;
  let error: string | null = null;
  try {
    res = await doFetch(openSecret(d.webhook.urlEncrypted, deps.encryptionKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const rendered = { ...payload, rendered: message } as unknown as Prisma.InputJsonValue;

  if (res?.ok) {
    await db.$transaction([
      db.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          responseStatus: res.status,
          attempts: { increment: 1 },
          error: null,
          payload: rendered,
        },
      }),
      db.outgoingWebhook.update({
        where: { id: d.webhookId },
        data: { failureCount: 0, lastDeliveryAt: new Date(), lastError: null },
      }),
    ]);
    return "sent";
  }

  if (res?.status === 429) {
    const body: unknown = await res.json().catch(() => null);
    const notBefore = new Date(Date.now() + retryAfterMs(res, body));
    await db.webhookDelivery.update({
      where: { id: d.id },
      data: { notBefore, responseStatus: 429, attempts: { increment: 1 }, payload: rendered },
    });
    await deps.boss.send("webhook.deliver", { deliveryId }, { startAfter: notBefore });
    logger.warn({ deliveryId, notBefore }, "discord rate limited; rescheduled");
    return "rescheduled";
  }

  const status = res?.status ?? null;
  error ??= `HTTP ${status ?? "?"}: ${(await res?.text().catch(() => ""))?.slice(0, 300) ?? ""}`;
  const permanent = status !== null && status >= 400 && status < 500 && status !== 408;
  const lastTry = permanent || (deps.retryCount ?? 0) >= (deps.retryLimit ?? 5);

  const hook = await db.$transaction(async (tx) => {
    await tx.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status: lastTry ? "FAILED" : "PENDING",
        responseStatus: status,
        attempts: { increment: 1 },
        error,
        payload: rendered,
      },
    });
    const updated = await tx.outgoingWebhook.update({
      where: { id: d.webhookId },
      data: { failureCount: { increment: 1 }, lastError: error },
      select: { failureCount: true, enabled: true, name: true },
    });
    if (updated.enabled && updated.failureCount >= AUTO_DISABLE_AFTER) {
      await tx.outgoingWebhook.update({
        where: { id: d.webhookId },
        data: {
          enabled: false,
          disabledReason: `Disabled after ${updated.failureCount} failed deliveries`,
        },
      });
      const admins = await tx.workspaceMember.findMany({
        where: { workspaceId: d.workspaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
        select: { userId: true },
      });
      await notifyFromJob(tx, {
        workspaceId: d.workspaceId,
        recipientIds: admins.map((a) => a.userId),
        type: "INTEGRATION_FAILED",
        entityType: "WORKSPACE",
        entityId: d.workspaceId,
        data: { name: updated.name, webhookId: d.webhookId, error },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: d.workspaceId,
          actorType: "SYSTEM",
          actorLabel: "Dopl worker",
          action: "webhook.auto_disabled",
          targetType: "webhook",
          targetId: d.webhookId,
          metadata: { failures: updated.failureCount, lastError: error },
        },
      });
      return { disabled: true };
    }
    return { disabled: false };
  });
  logger.warn({ deliveryId, status, error, disabled: hook.disabled }, "webhook delivery failed");
  if (lastTry || hook.disabled) return "failed";
  return "retry";
}
