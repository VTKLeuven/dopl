import "server-only";
import { canWorkspace, ForbiddenError } from "@dopl/shared/policy";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";

export interface WebhookView {
  id: string;
  name: string;
  urlHint: string;
  events: string[];
  projectIds: string[];
  mailboxIds: string[];
  includeContent: boolean;
  enabled: boolean;
  failureCount: number;
  lastDeliveryAt: string | null;
  lastError: string | null;
  disabledReason: string | null;
  deliveries: Array<{
    id: string;
    eventType: string;
    status: "PENDING" | "SENT" | "FAILED" | "DROPPED";
    responseStatus: number | null;
    attempts: number;
    error: string | null;
    createdAt: string;
    sentAt: string | null;
  }>;
}

/** Settings → Integrations: webhooks with their recent delivery log (never the URL). */
export async function listWebhooks(ctx: WorkspaceCtx): Promise<WebhookView[]> {
  if (!canWorkspace(ctx.policyActor, "workspace.integrations.manage")) throw new ForbiddenError();
  const hooks = await db.outgoingWebhook.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      urlHint: true,
      events: true,
      projectIds: true,
      mailboxIds: true,
      includeContent: true,
      enabled: true,
      failureCount: true,
      lastDeliveryAt: true,
      lastError: true,
      disabledReason: true,
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          eventType: true,
          status: true,
          responseStatus: true,
          attempts: true,
          error: true,
          createdAt: true,
          sentAt: true,
        },
      },
    },
  });
  return hooks.map((h) => ({
    ...h,
    lastDeliveryAt: h.lastDeliveryAt?.toISOString() ?? null,
    deliveries: h.deliveries.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      sentAt: d.sentAt?.toISOString() ?? null,
    })),
  }));
}
