/** Serializable shapes shared by the messages queries and the chat UI. */
import type { StateGroup } from "@dopl/shared/schemas/work-item";

export type ChannelKind = "PROJECT" | "CUSTOM" | "DM" | "GROUP_DM";

export interface Person {
  id: string;
  name: string;
  email: string;
  image: string | null;
  kind: "HUMAN" | "AGENT" | "SYSTEM";
}

export interface ChannelListItem {
  id: string;
  kind: ChannelKind;
  /** Channel name, or the other participants' names for DMs. */
  name: string;
  isPrivate: boolean;
  project: { id: string; identifier: string; name: string; color: string | null } | null;
  /** DMs: the other participants. */
  people: Array<Pick<Person, "id" | "name" | "image" | "kind">>;
  /** Unread top-level messages from others. */
  unread: number;
  /** Unread @mentions of me in this channel. */
  mentions: number;
  lastMessageAt: string | null;
}

export interface ChannelList {
  projects: ChannelListItem[];
  channels: ChannelListItem[];
  dms: ChannelListItem[];
}

export interface BrowsableChannel {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  joined: boolean;
}

export interface ChannelDetail {
  id: string;
  kind: ChannelKind;
  name: string;
  topic: string | null;
  description: string | null;
  isPrivate: boolean;
  archivedAt: string | null;
  project: { id: string; identifier: string; name: string; color: string | null } | null;
  /** Everyone who can read the channel (people to @mention). */
  members: Array<Person & { role: "OWNER" | "MEMBER" | null }>;
  /** Only CUSTOM public channels: anyone in the workspace may be mentioned. */
  openToWorkspace: boolean;
  lastReadAt: string | null;
  can: { post: boolean; manage: boolean; join: boolean; leave: boolean; addMembers: boolean };
  me: string;
}

export interface ItemRefInfo {
  id: string;
  identifier: string;
  title: string;
  stateGroup: StateGroup;
  stateColor: string | null;
}

export interface MessageView {
  id: string;
  channelId: string;
  threadRootId: string | null;
  kind: "USER" | "SYSTEM" | "AGENT";
  /** The AI teammate's answer: the run it came from (Phase 8). */
  agentRunId: string | null;
  author: Pick<Person, "id" | "name" | "image" | "kind"> | null;
  body: unknown;
  /** Soft-deleted roots with replies stay as a tombstone. */
  deleted: boolean;
  createdAt: string;
  editedAt: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  reactions: Array<{ emoji: string; userIds: string[] }>;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number }>;
  /** Work items created from this message. */
  createdItems: ItemRefInfo[];
}

export interface MessagePage {
  messages: MessageView[];
  /** `#INFRA-42` chips: referenced items the reader can see. */
  refs: Record<string, ItemRefInfo>;
  /** Cursor for older messages, or null at the start of the channel. */
  older: string | null;
}

export interface ThreadView {
  root: MessageView;
  replies: MessageView[];
  refs: Record<string, ItemRefInfo>;
  following: boolean;
}
