/** Serializable note shapes shared by server queries and client views. */
import type { TagColor } from "@dopl/shared/palette";
import type { StateGroup } from "@dopl/shared/schemas/work-item";

export interface NoteRef {
  id: string;
  identifier: string;
  title: string;
  stateGroup: StateGroup;
}

export interface NoteCard {
  id: string;
  owner: { id: string; name: string; image: string | null };
  content: unknown;
  contentText: string;
  color: TagColor | null;
  visibility: "PRIVATE" | "WORKSPACE";
  project: { id: string; identifier: string; name: string; color: string | null } | null;
  workItem: { id: string; identifier: string; title: string } | null;
  pinnedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  /** Tag paths written in the note, e.g. "infra/proxmox". */
  tags: string[];
  todoCount: number;
  openTodoCount: number;
  /** The work item this note was converted into (if the viewer can see it). */
  convertedTo: NoteRef | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canShare: boolean;
}

export interface TagRow {
  id: string;
  path: string;
  name: string;
  parentId: string | null;
  /** Live notes carrying this exact tag (children are counted separately). */
  count: number;
}

export interface TodoRow {
  id: string;
  noteId: string;
  blockId: string;
  text: string;
  checked: boolean;
  dueDate: string | null;
  position: number;
  note: { id: string; title: string; color: TagColor | null };
  workItem: NoteRef | null;
}

export interface ReviewData {
  notes: NoteCard[];
  /** Handled today (kept, archived, snoozed or converted). */
  doneToday: number;
  limit: number;
  /** Notes due tomorrow, for the "you're done" state. */
  dueTomorrow: number;
}

export interface NotesSummary {
  counts: { all: number; pinned: number; shared: number; archived: number; trash: number };
  openTodos: number;
  reviewLeft: number;
}

export interface NoteSearchHit {
  id: string;
  title: string;
  excerpt: string;
  color: TagColor | null;
  ownerName: string;
  mine: boolean;
}
