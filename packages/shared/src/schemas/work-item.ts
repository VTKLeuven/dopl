import { z } from "zod";

export const PrioritySchema = z.enum(["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"]);
export type Priority = z.infer<typeof PrioritySchema>;
export const priorities: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"];

export const StateGroupSchema = z.enum(["TRIAGE", "BACKLOG", "UNSTARTED", "STARTED", "COMPLETED", "CANCELLED"]);
export type StateGroup = z.infer<typeof StateGroupSchema>;
export const OPEN_GROUPS: StateGroup[] = ["BACKLOG", "UNSTARTED", "STARTED"];
export const DONE_GROUPS: StateGroup[] = ["COMPLETED", "CANCELLED"];

/** Calendar date as YYYY-MM-DD (no time zone). */
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/**
 * Rich text is ProseMirror/Tiptap JSON. We validate the envelope here and the
 * node/mark allowlist in the server sanitizer (D-019).
 */
export const RichTextSchema = z.object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() }).passthrough();
export type RichText = z.infer<typeof RichTextSchema>;

export const TitleSchema = z.string().trim().min(1, "Give it a title.").max(300);

export const CreateWorkItemSchema = z.object({
  projectId: z.uuid(),
  title: TitleSchema,
  description: RichTextSchema.nullish(),
  stateId: z.uuid().nullish(),
  priority: PrioritySchema.default("NONE"),
  typeId: z.uuid().nullish(),
  assigneeIds: z.array(z.uuid()).max(20).default([]),
  labelIds: z.array(z.uuid()).max(30).default([]),
  parentId: z.uuid().nullish(),
  startDate: DateOnlySchema.nullish(),
  dueDate: DateOnlySchema.nullish(),
  estimate: z.number().min(0).max(1000).nullish(),
  /** Client-generated id so optimistic rows keep their key. */
  clientId: z.uuid().optional(),
});
export type CreateWorkItemInput = z.input<typeof CreateWorkItemSchema>;

export const CreateManyWorkItemsSchema = CreateWorkItemSchema.omit({ title: true, clientId: true }).extend({
  titles: z.array(TitleSchema).min(1).max(100),
});

export const UpdateWorkItemSchema = z.object({
  id: z.uuid(),
  title: TitleSchema.optional(),
  description: RichTextSchema.nullable().optional(),
  stateId: z.uuid().optional(),
  priority: PrioritySchema.optional(),
  typeId: z.uuid().nullable().optional(),
  assigneeIds: z.array(z.uuid()).max(20).optional(),
  labelIds: z.array(z.uuid()).max(30).optional(),
  parentId: z.uuid().nullable().optional(),
  startDate: DateOnlySchema.nullable().optional(),
  dueDate: DateOnlySchema.nullable().optional(),
  estimate: z.number().min(0).max(1000).nullable().optional(),
});
export type UpdateWorkItemInput = z.input<typeof UpdateWorkItemSchema>;

/** Manual reorder: place `id` between two neighbours in the rendered order. */
export const MoveWorkItemSchema = z.object({
  id: z.uuid(),
  beforeId: z.uuid().nullable(), // item rendered above the drop position
  afterId: z.uuid().nullable(), // item rendered below
});

export const BulkUpdateSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  patch: UpdateWorkItemSchema.omit({ id: true, title: true, description: true }),
});

export const RelationTypeSchema = z.enum(["BLOCKS", "BLOCKED_BY", "RELATES_TO", "DUPLICATE_OF"]);
export const AddRelationSchema = z.object({ id: z.uuid(), type: RelationTypeSchema, targetId: z.uuid() });

export const AddLinkSchema = z.object({ id: z.uuid(), url: z.url().max(2000), title: z.string().trim().max(200).optional() });

export const CommentSchema = z.object({
  workItemId: z.uuid(),
  body: RichTextSchema,
  visibility: z.enum(["INTERNAL", "PUBLIC"]).default("INTERNAL"),
});
export const EditCommentSchema = z.object({ id: z.uuid(), body: RichTextSchema });
export const ReactionSchema = z.object({ commentId: z.uuid(), emoji: z.string().min(1).max(16) });

export function formatIdentifier(projectIdentifier: string, sequence: number | null, intakeNumber?: number | null) {
  return sequence != null ? `${projectIdentifier}-${sequence}` : intakeNumber != null ? `Intake #${intakeNumber}` : projectIdentifier;
}

/** "INFRA-42" → { identifier: "INFRA", sequence: 42 } */
export function parseIdentifier(value: string): { identifier: string; sequence: number } | null {
  const m = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/.exec(value.trim());
  if (!m?.[1] || !m[2]) return null;
  return { identifier: m[1].toUpperCase(), sequence: Number(m[2]) };
}
