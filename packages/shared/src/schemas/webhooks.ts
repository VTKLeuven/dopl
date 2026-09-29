/**
 * Outgoing webhooks (D-052). Discord only for now. Event keys are stable
 * strings stored in `OutgoingWebhook.events`.
 */
import { z } from "zod";

export const WEBHOOK_EVENTS = [
  "work_item.created",
  "work_item.state_changed",
  "work_item.completed",
  "work_item.assigned",
  "intake.submitted",
  "intake.accepted",
  // Later phases (accepted in storage, not offered in the UI yet).
  "email_thread.created",
  "email_message.received",
  "agent.approval_requested",
] as const;
export const WebhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/** Events the settings UI offers today (Phase 3). */
export const AVAILABLE_WEBHOOK_EVENTS: WebhookEvent[] = [
  "work_item.created",
  "work_item.state_changed",
  "work_item.completed",
  "work_item.assigned",
  "intake.submitted",
  "intake.accepted",
];

/**
 * Updates to one entity inside this window become one Discord message; the
 * message shows the item as it is when the window closes.
 */
export const COALESCE_WINDOW_MS = 60_000;
export const COALESCED_EVENTS = new Set<WebhookEvent>([
  "work_item.state_changed",
  "work_item.completed",
  "work_item.assigned",
]);
export const AUTO_DISABLE_AFTER = 10;

const DISCORD_URL =
  /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,30}\/[\w-]{20,200}$/;
const LOCAL_URL = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{2,5})?\/[\w\-/.]*$/;

/**
 * Only Discord's webhook host is allowed, so the worker can't be pointed at
 * internal services. Development may also post to localhost (mock receivers).
 */
export function isAllowedWebhookUrl(url: string, opts: { allowLocal: boolean }): boolean {
  return DISCORD_URL.test(url) || (opts.allowLocal && LOCAL_URL.test(url));
}

/** "https://discord.com/api/webhooks/123/abcdef…" → "…/123/abcd…wxyz" */
export function webhookUrlHint(url: string): string {
  const m = /\/webhooks\/(\d+)\/([\w-]+)$/.exec(url);
  if (!m?.[1] || !m[2]) {
    try {
      return new URL(url).host;
    } catch {
      return "…";
    }
  }
  return `…/${m[1]}/${m[2].slice(0, 4)}…${m[2].slice(-4)}`;
}

export const WebhookInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  events: z.array(WebhookEventSchema).min(1).max(WEBHOOK_EVENTS.length),
  /** Empty = every project. */
  projectIds: z.array(z.uuid()).max(100).default([]),
  includeContent: z.boolean().default(false),
});

export const CreateWebhookSchema = WebhookInputSchema.extend({
  url: z.url().max(500),
});
export type CreateWebhookInput = z.input<typeof CreateWebhookSchema>;

export const UpdateWebhookSchema = WebhookInputSchema.partial().extend({
  id: z.uuid(),
  /** Only when replacing the URL; the stored one is never sent to the client. */
  url: z.url().max(500).optional(),
  enabled: z.boolean().optional(),
});

/** What a queued delivery remembers until it is rendered at send time. */
export const DeliveryPayloadSchema = z.object({
  events: z
    .array(
      z.object({
        type: WebhookEventSchema,
        at: z.string(),
        /** Small facts about the change, e.g. { from: "Todo", to: "Done" }. */
        detail: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(50),
  test: z.boolean().optional(),
  /** Filled in by the worker: exactly what was posted (for redelivery). */
  rendered: z.unknown().optional(),
});
export type DeliveryPayload = z.infer<typeof DeliveryPayloadSchema>;
