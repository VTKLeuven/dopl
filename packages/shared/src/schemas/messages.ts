/** Team chat: channels, DMs, messages, threads (Phase 4). */
import { z } from "zod";
import { RichTextSchema, TitleSchema } from "./work-item";

export const ChannelNameSchema = z
  .string()
  .trim()
  .min(1, "Give the channel a name.")
  .max(80)
  .refine((s) => channelSlug(s).length > 0, "Use letters or numbers.");

export const CreateChannelSchema = z.object({
  name: ChannelNameSchema,
  description: z.string().trim().max(500).default(""),
  isPrivate: z.boolean().default(false),
  memberIds: z.array(z.uuid()).max(200).default([]),
});
export type CreateChannelInput = z.input<typeof CreateChannelSchema>;

export const UpdateChannelSchema = z.object({
  id: z.uuid(),
  name: ChannelNameSchema.optional(),
  topic: z.string().trim().max(250).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export const ChannelMembersSchema = z.object({
  channelId: z.uuid(),
  userIds: z.array(z.uuid()).min(1).max(200),
});

/** 1 other person → DM, 2–8 → group DM. */
export const OpenDmSchema = z.object({ userIds: z.array(z.uuid()).min(1).max(8) });

export const SendMessageSchema = z.object({
  channelId: z.uuid(),
  threadRootId: z.uuid().nullish(),
  body: RichTextSchema,
  attachmentIds: z.array(z.uuid()).max(10).default([]),
  /** Client-generated id so the optimistic row and the real one match. */
  clientId: z.uuid().optional(),
});
export type SendMessageInput = z.input<typeof SendMessageSchema>;

export const EditMessageSchema = z.object({ id: z.uuid(), body: RichTextSchema });
export const MessageReactionSchema = z.object({
  messageId: z.uuid(),
  emoji: z.string().min(1).max(16),
});
export const MarkChannelReadSchema = z.object({
  channelId: z.uuid(),
  /** The newest message the reader has seen; defaults to now. */
  at: z.iso.datetime({ offset: true }).optional(),
});
export const ThreadFollowSchema = z.object({ rootId: z.uuid(), follow: z.boolean() });

export const CreateItemFromMessageSchema = z.object({
  messageId: z.uuid(),
  projectId: z.uuid(),
  title: TitleSchema,
  clientId: z.uuid().optional(),
});

/** "Release Planning!" → "release-planning" (unique per workspace). */
export function channelSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Sorted participant ids joined with ":" — one DM per set of people. */
export function dmKey(userIds: string[]): string {
  return [...new Set(userIds)].sort().join(":");
}

/** Typing indicators: pings every few seconds while typing; clients expire them. */
export const TYPING_PING_MS = 2_500;
export const TYPING_TTL_MS = 4_000;
