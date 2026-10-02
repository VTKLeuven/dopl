import { z } from "zod";
import { normalizeRuleValue } from "../domain/mail";
import { RichTextSchema } from "./work-item";

/** Shared mailbox inputs (ROADMAP §Phase 7). */

export const MAIL_VIEWS = ["unassigned", "mine", "open", "snoozed", "solved", "all"] as const;
export type MailView = (typeof MAIL_VIEWS)[number];
export const MailViewSchema = z.enum(MAIL_VIEWS);

const Address = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .refine((v) => v.length <= 254);

export const CreateMailboxSchema = z.object({
  emailAddress: Address,
  displayName: z.string().trim().max(80).nullable().default(null),
  backfillDays: z.number().int().min(1).max(365).default(90),
  memberIds: z.array(z.uuid()).max(200).default([]),
  defaultAssigneeId: z.uuid().nullable().default(null),
});

/**
 * Your own work mailbox (D-138). Only the address on your account can be
 * connected: domain-wide delegation could open anyone's mailbox.
 */
export const ConnectPersonalMailboxSchema = z.object({
  backfillDays: z.number().int().min(1).max(365).default(30),
});

export const UpdateMailboxSchema = z.object({
  id: z.uuid(),
  displayName: z.string().trim().max(80).nullable().optional(),
  backfillDays: z.number().int().min(1).max(365).optional(),
  memberIds: z.array(z.uuid()).max(200).optional(),
  defaultAssigneeId: z.uuid().nullable().optional(),
  /** Replies from Dopl (Phase 7b); needs the gmail.send scope on the delegation. */
  sendEnabled: z.boolean().optional(),
});

/** Mail that matches arrives ignored (D-136); matching is "contains", ignoring case. */
export const CreateIgnoreRuleSchema = z.object({
  mailboxId: z.uuid(),
  field: z.enum(["SENDER", "SUBJECT"]),
  value: z.string().transform(normalizeRuleValue).pipe(z.string().min(3).max(200)),
  /** Also ignore the open conversations it matches now. */
  applyToOpen: z.boolean().default(true),
});
export const DeleteIgnoreRuleSchema = z.object({ id: z.uuid() });

export const MailboxIdSchema = z.uuid();
export const ThreadIdSchema = z.uuid();

export const ThreadQuerySchema = z.object({
  mailboxId: z.uuid().nullable().default(null),
  view: MailViewSchema.default("open"),
  q: z.string().trim().max(200).nullable().default(null),
  /** Keyset cursor: `${lastMessageAt ISO}|${id}` of the last row. */
  cursor: z.string().max(80).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(50),
});
export type ThreadQuery = z.infer<typeof ThreadQuerySchema>;

export const AssignThreadSchema = z.object({ threadId: z.uuid(), assigneeId: z.uuid().nullable() });
export const SetThreadStatusSchema = z.object({
  threadId: z.uuid(),
  status: z.enum(["OPEN", "SOLVED", "IGNORED"]),
});
export const SnoozeThreadSchema = z.object({
  threadId: z.uuid(),
  /** null wakes it now. */
  until: z.iso.datetime().nullable(),
});
export const SetThreadLabelsSchema = z.object({
  threadId: z.uuid(),
  labelIds: z.array(z.uuid()).max(20),
  /** Names of new workspace labels to create and add. */
  create: z.array(z.string().trim().min(1).max(40)).max(5).default([]),
});
export const EmailCommentSchema = z.object({ threadId: z.uuid(), body: RichTextSchema });
export const PromoteThreadSchema = z.object({
  threadId: z.uuid(),
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(300),
});
export const LinkThreadSchema = z.object({
  threadId: z.uuid(),
  /** "INFRA-42" or a work item id. */
  item: z.string().trim().min(1).max(64),
});
export const UnlinkThreadSchema = z.object({ threadId: z.uuid(), workItemId: z.uuid() });
export const PresenceSchema = z.object({
  threadId: z.uuid(),
  state: z.enum(["VIEWING", "REPLYING"]),
});
export const ReplySchema = z.object({
  threadId: z.uuid(),
  body: RichTextSchema,
  replyAll: z.boolean().default(false),
  /** A send-as address of the mailbox; defaults to the mailbox. */
  from: z.email().nullable().default(null),
});
