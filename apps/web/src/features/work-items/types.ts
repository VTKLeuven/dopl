/** Serializable shapes shared by server queries and client views. */
import type { Priority, StateGroup } from "@dopl/shared/schemas/work-item";
import type { PublicStatus } from "@dopl/shared/schemas/intake";

export interface WorkItemRow {
  id: string;
  projectId: string;
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
  /** Set in workspace (cross-project) metadata. */
  projectId?: string;
  projectName?: string;
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
  /** Only in workspace (cross-project) metadata. */
  projects?: Array<{ id: string; identifier: string; name: string; color: string | null }>;
  states: StateMeta[];
  labels: LabelMeta[];
  types: TypeMeta[];
  members: MemberMeta[];
  can: { create: boolean; edit: boolean; delete: boolean; manage: boolean; comment: boolean };
  me: string;
  /** Calendar settings for date math (today, week bounds). */
  calendar: { timeZone: string; weekStartsOn: number };
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

/** The triage record behind an item that came in as a request (Phase 3). */
export interface RequestInfo {
  id: string;
  number: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "DUPLICATE";
  source: "IN_APP" | "FORM" | "EMAIL" | "API";
  snoozedUntil: string | null;
  declineReason: string | null;
  triagedAt: string | null;
  triagedByName: string | null;
  duplicateOf: { identifier: string; title: string } | null;
  submitter: { kind: "contact" | "user"; id: string; name: string; email: string } | null;
  form: { id: string; title: string } | null;
  answers: Array<{
    key: string;
    label: string;
    type: string;
    value: string | string[] | boolean | null;
  }>;
  publicStatus: PublicStatus;
}

/** A chat message that mentions the item or that it was created from (Phase 4). */
export interface ReferenceView {
  id: string;
  kind: "MENTIONED" | "LINKED" | "CREATED_FROM";
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  message: {
    id: string;
    channelId: string;
    channelKind: "PROJECT" | "CUSTOM" | "DM" | "GROUP_DM";
    /** null for DMs. */
    channelName: string | null;
    threadRootId: string | null;
    excerpt: string;
    authorName: string | null;
  };
}

export interface WorkItemDetail extends WorkItemRow {
  request: RequestInfo | null;
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
  references: ReferenceView[];
  subscribed: boolean;
  archivedAt: string | null;
}
