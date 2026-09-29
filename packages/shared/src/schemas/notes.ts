import { z } from "zod";
import { TagColorSchema } from "./palette";
import { DateOnlySchema, RichTextSchema, TitleSchema } from "./work-item";
import { SNOOZE_OPTIONS, TAG_MAX_LENGTH } from "../domain/notes";

/** Notes (PROMPT §4.6, DATA_MODEL §3.5). Content is Tiptap JSON, sanitized on the server. */

export const NoteVisibilitySchema = z.enum(["PRIVATE", "WORKSPACE"]);
export type NoteVisibility = z.infer<typeof NoteVisibilitySchema>;

/** Who can see a note besides its owner: nobody, the team, a project or a work item. */
export const NoteSharingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("private") }),
  z.object({ kind: z.literal("workspace") }),
  z.object({ kind: z.literal("project"), projectId: z.uuid() }),
  z.object({ kind: z.literal("workItem"), workItemId: z.uuid() }),
]);
export type NoteSharing = z.infer<typeof NoteSharingSchema>;

export const CreateNoteSchema = z.object({
  /** Client-generated id so the optimistic card keeps its key. */
  clientId: z.uuid().optional(),
  content: RichTextSchema,
  color: TagColorSchema.nullish(),
  pinned: z.boolean().optional(),
  sharing: NoteSharingSchema.optional(),
});
export type CreateNoteInput = z.input<typeof CreateNoteSchema>;

export const UpdateNoteSchema = z.object({
  id: z.uuid(),
  content: RichTextSchema.optional(),
  color: TagColorSchema.nullable().optional(),
  pinned: z.boolean().optional(),
  sharing: NoteSharingSchema.optional(),
});
export type UpdateNoteInput = z.input<typeof UpdateNoteSchema>;

export const NoteIdSchema = z.uuid();

export const ToggleTodoSchema = z.object({
  noteId: z.uuid(),
  blockId: z.string().min(1).max(64),
  checked: z.boolean(),
});
export type ToggleTodoInput = z.input<typeof ToggleTodoSchema>;

export const SetTodoDueSchema = z.object({
  todoId: z.uuid(),
  dueDate: DateOnlySchema.nullable(),
});

export const ConvertTodoSchema = z.object({
  noteId: z.uuid(),
  blockId: z.string().min(1).max(64),
  projectId: z.uuid(),
  title: TitleSchema.optional(),
});
export type ConvertTodoInput = z.input<typeof ConvertTodoSchema>;

export const ConvertNoteSchema = z.object({
  noteId: z.uuid(),
  projectId: z.uuid(),
  title: TitleSchema.optional(),
  /** Converting from the daily review also counts as reviewing it. */
  fromReview: z.boolean().optional(),
});
export type ConvertNoteInput = z.input<typeof ConvertNoteSchema>;

export const ReviewActionSchema = z.discriminatedUnion("action", [
  z.object({ noteId: z.uuid(), action: z.literal("keep") }),
  z.object({ noteId: z.uuid(), action: z.literal("archive") }),
  z.object({
    noteId: z.uuid(),
    action: z.literal("snooze"),
    days: z
      .number()
      .int()
      .refine((d) => (SNOOZE_OPTIONS as readonly number[]).includes(d))
      .default(1),
  }),
]);
export type ReviewActionInput = z.input<typeof ReviewActionSchema>;

const TagPathInput = z
  .string()
  .trim()
  .min(1)
  .max(TAG_MAX_LENGTH + 1);

/** Renaming onto an existing path merges the two tags. */
export const RenameTagSchema = z.object({ tagId: z.uuid(), path: TagPathInput });
export const DeleteTagSchema = z.object({ tagId: z.uuid() });

/** List filters for the notes grid (URL state). */
export const NoteFilterSchema = z.enum(["all", "pinned", "shared", "archived", "trash"]);
export type NoteFilter = z.infer<typeof NoteFilterSchema>;

export const NotesQuerySchema = z.object({
  filter: NoteFilterSchema.catch("all"),
  tag: z.string().trim().max(TAG_MAX_LENGTH).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  /** Notes attached to (or converted into) one work item. */
  item: z.uuid().optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(300).catch(300),
});
export type NotesQuery = z.infer<typeof NotesQuerySchema>;

export const TodoStatusSchema = z.enum(["open", "done", "converted"]);
export type TodoStatus = z.infer<typeof TodoStatusSchema>;
