/** Serializable shapes shared by server queries and client views. */
import type { Priority, StateGroup } from "@dopl/shared/schemas/work-item";

export interface WorkItemRow {
  id: string;
  sequence: number | null;
  identifier: string;
  title: string;
  stateId: string;
  stateGroup: StateGroup;
  priority: Priority;
  typeId: string | null;
  parentId: string | null;
  sortKey: string;
  startDate: string | null; // YYYY-MM-DD
  dueDate: string | null;
  estimate: number | null;
  assigneeIds: string[];
  labelIds: string[];
  childCount: number;
  childDoneCount: number;
  commentCount: number;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface StateMeta {
  id: string;
  name: string;
  group: StateGroup;
  color: string;
  sortKey: string;
  isDefault: boolean;
}
export interface LabelMeta {
  id: string;
  name: string;
  color: string;
  projectId: string | null;
}
export interface TypeMeta {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}
export interface MemberMeta {
  id: string;
  name: string;
  email: string;
  image: string | null;
  kind: "HUMAN" | "AGENT" | "SYSTEM";
}

export interface ProjectMeta {
  project: {
    id: string;
    identifier: string;
    name: string;
    color: string | null;
    estimateSystem: "NONE" | "POINTS" | "HOURS";
  };
  states: StateMeta[];
  labels: LabelMeta[];
  types: TypeMeta[];
  members: MemberMeta[];
  can: { create: boolean; edit: boolean; delete: boolean; manage: boolean; comment: boolean };
  me: string;
}

export interface CommentView {
  id: string;
  authorId: string | null;
  authorName: string;
  body: unknown;
  visibility: "INTERNAL" | "PUBLIC";
  createdAt: string;
  editedAt: string | null;
  reactions: Array<{ emoji: string; userIds: string[] }>;
}
export interface ActivityView {
  id: string;
  actorId: string | null;
  actorName: string;
  verb: string;
  field: string | null;
  fromValue: unknown;
  toValue: unknown;
  meta: Record<string, unknown>;
  createdAt: string;
}
export interface RelationView {
  id: string;
  kind: "blocks" | "blocked_by" | "relates_to" | "duplicate_of" | "duplicated_by";
  item: { id: string; identifier: string; title: string; stateGroup: StateGroup };
}

export interface WorkItemDetail extends WorkItemRow {
  projectId: string;
  projectIdentifier: string;
  description: unknown;
  createdById: string | null;
  parent: { id: string; identifier: string; title: string } | null;
  children: WorkItemRow[];
  relations: RelationView[];
  links: Array<{ id: string; url: string; title: string | null }>;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    createdAt: string;
    uploadedByName: string | null;
  }>;
  comments: CommentView[];
  activities: ActivityView[];
  subscribed: boolean;
  archivedAt: string | null;
}
