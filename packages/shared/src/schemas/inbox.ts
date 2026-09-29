/**
 * Inbox (notifications) and notification preferences (Phase 4).
 * NOTIFICATION_TYPES mirrors the Prisma enum; a test in the web app keeps
 * them in sync.
 */
import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "MENTION",
  "ASSIGNED",
  "WORK_ITEM_UPDATED",
  "COMMENT",
  "INTAKE_SUBMITTED",
  "INTAKE_REPLY",
  "AGENT_APPROVAL_REQUESTED",
  "AGENT_RUN_FINISHED",
  "EMAIL_ASSIGNED",
  "EMAIL_MENTION",
  "EMAIL_REPLY",
  "DUE_SOON",
  "SNOOZE_ENDED",
  "INTAKE_UPDATED",
  "THREAD_REPLY",
  "INTEGRATION_FAILED",
] as const;
export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

/**
 * The type filter in the Inbox. Every type belongs to exactly one bucket
 * (tested), so bucket counts add up to the total.
 */
export const INBOX_FILTERS = {
  mentions: ["MENTION", "EMAIL_MENTION"],
  assigned: ["ASSIGNED", "EMAIL_ASSIGNED"],
  updates: ["WORK_ITEM_UPDATED", "DUE_SOON", "SNOOZE_ENDED", "INTAKE_UPDATED"],
  comments: ["COMMENT", "THREAD_REPLY", "INTAKE_REPLY", "EMAIL_REPLY"],
  requests: ["INTAKE_SUBMITTED"],
  agent: ["AGENT_APPROVAL_REQUESTED", "AGENT_RUN_FINISHED"],
  system: ["INTEGRATION_FAILED"],
} as const satisfies Record<string, readonly NotificationType[]>;
export type InboxFilter = keyof typeof INBOX_FILTERS;
export const INBOX_FILTER_KEYS = Object.keys(INBOX_FILTERS) as InboxFilter[];
export const InboxFilterSchema = z.enum(INBOX_FILTER_KEYS as [InboxFilter, ...InboxFilter[]]);

export function filterOfType(type: NotificationType): InboxFilter {
  for (const key of INBOX_FILTER_KEYS)
    if ((INBOX_FILTERS[key] as readonly NotificationType[]).includes(type)) return key;
  return "system";
}

/** unread/all: the inbox itself; snoozed and archived are side lists. */
export const InboxViewSchema = z.enum(["unread", "all", "snoozed", "archived"]);
export type InboxView = z.infer<typeof InboxViewSchema>;

export const InboxQuerySchema = z.object({
  view: InboxViewSchema.catch("all"),
  filter: InboxFilterSchema.nullable().catch(null),
  /** Keyset cursor: `<createdAt ISO>|<id>` of the last row seen. */
  cursor: z
    .string()
    .regex(/^[\d\-T:.Z]+\|[0-9a-f-]{36}$/)
    .nullable()
    .catch(null),
});
export type InboxQuery = z.infer<typeof InboxQuerySchema>;

const Ids = z.array(z.uuid()).min(1).max(500);
export const InboxBulkSchema = z.object({
  ids: Ids,
  action: z.enum(["read", "unread", "archive", "unarchive"]),
});
export const InboxSnoozeSchema = z.object({
  ids: Ids,
  /** null wakes the notifications up now. */
  until: z.iso.datetime({ offset: true }).nullable(),
});
export const MarkAllReadSchema = z.object({ filter: InboxFilterSchema.nullable().default(null) });

export const NotificationPreferenceSchema = z
  .object({
    type: NotificationTypeSchema,
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
  })
  .refine((p) => p.inApp !== undefined || p.email !== undefined, "Nothing to change.");

/** Defaults when a user has no preference row: in-app on, email off. */
export const DEFAULT_PREFERENCE = { inApp: true, email: false } as const;
