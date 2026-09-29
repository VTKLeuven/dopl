import "server-only";
import { Prisma, type TransactionClient } from "@dopl/db";
import {
  canChannel,
  type ChannelAction,
  type PolicyActor,
  type PolicyChannel,
} from "@dopl/shared/policy";
import { extractItemRefs, type PMNode } from "@dopl/shared/rich-text";
import { formatIdentifier } from "@dopl/shared/schemas/work-item";
import type {
  BrowsableChannel,
  ChannelDetail,
  ChannelList,
  ChannelListItem,
  ItemRefInfo,
  MessagePage,
  MessageView,
  Person,
  ThreadView,
} from "@/features/messages/types";
import { NotFoundError } from "../action-result";
import { db } from "../db";
import type { WorkspaceCtx } from "../session";
import { accessibleProjectsWhere } from "./projects";

type Db = typeof db | TransactionClient;

/* ───────────────────────── access ───────────────────────── */

export const channelAccessSelect = (userId: string) =>
  ({
    id: true,
    workspaceId: true,
    kind: true,
    name: true,
    topic: true,
    description: true,
    isPrivate: true,
    projectId: true,
    archivedAt: true,
    lastMessageAt: true,
    members: { where: { userId }, select: { role: true, lastReadAt: true } },
    project: {
      select: {
        id: true,
        identifier: true,
        name: true,
        color: true,
        visibility: true,
        guestsCanViewProject: true,
        archivedAt: true,
        deletedAt: true,
        members: { where: { userId }, select: { role: true } },
      },
    },
  }) satisfies Prisma.ChannelSelect;

export type ChannelAccessRow = Prisma.ChannelGetPayload<{
  select: ReturnType<typeof channelAccessSelect>;
}>;

export function toPolicyChannel(row: ChannelAccessRow): PolicyChannel {
  return {
    kind: row.kind,
    isPrivate: row.isPrivate,
    archivedAt: row.archivedAt,
    memberRole: row.members[0]?.role ?? null,
    project:
      row.project && !row.project.deletedAt
        ? {
            visibility: row.project.visibility,
            guestsCanViewProject: row.project.guestsCanViewProject,
            archivedAt: row.project.archivedAt,
            memberRole: row.project.members[0]?.role ?? null,
          }
        : null,
  };
}

export interface ChannelAccess {
  channel: ChannelAccessRow;
  policy: PolicyChannel;
  can: (action: ChannelAction) => boolean;
}

/** A channel the actor can see, or NotFoundError (invisible channels look nonexistent). */
export async function channelAccessById(
  ctx: WorkspaceCtx,
  channelId: string,
  client: Db = db,
): Promise<ChannelAccess> {
  const channel = await client.channel.findFirst({
    where: { id: channelId, workspaceId: ctx.workspace.id },
    select: channelAccessSelect(ctx.actor.userId),
  });
  if (!channel) throw new NotFoundError();
  const policy = toPolicyChannel(channel);
  if (!canChannel(ctx.policyActor, policy, "channel.view")) throw new NotFoundError();
  return { channel, policy, can: (a) => canChannel(ctx.policyActor, policy, a) };
}

/**
 * Which of these users may read the channel (mention and thread-reply
 * recipients). Same policy as the reader side, evaluated per person.
 */
export async function usersWhoCanView(
  client: Db,
  channel: {
    id: string;
    workspaceId: string;
    kind: PolicyChannel["kind"];
    isPrivate: boolean;
    archivedAt: Date | null;
    projectId: string | null;
  },
  userIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  // Sequential: inside a transaction there is one connection.
  const members = await client.workspaceMember.findMany({
    where: { workspaceId: channel.workspaceId, userId: { in: ids }, status: "ACTIVE" },
    select: {
      userId: true,
      role: true,
      canApproveAgentActions: true,
      user: { select: { kind: true } },
    },
  });
  const channelRoles = await client.channelMember.findMany({
    where: { channelId: channel.id, userId: { in: ids } },
    select: { userId: true, role: true },
  });
  const project = channel.projectId
    ? await client.project.findUnique({
        where: { id: channel.projectId },
        select: {
          visibility: true,
          guestsCanViewProject: true,
          archivedAt: true,
          deletedAt: true,
          members: { where: { userId: { in: ids } }, select: { userId: true, role: true } },
        },
      })
    : null;
  const out = new Set<string>();
  for (const m of members) {
    const actor: PolicyActor = {
      userId: m.userId,
      kind: m.user.kind,
      workspaceRole: m.role,
      canApproveAgentActions: m.canApproveAgentActions,
    };
    const policy: PolicyChannel = {
      kind: channel.kind,
      isPrivate: channel.isPrivate,
      archivedAt: channel.archivedAt,
      memberRole: channelRoles.find((r) => r.userId === m.userId)?.role ?? null,
      project:
        project && !project.deletedAt
          ? {
              visibility: project.visibility,
              guestsCanViewProject: project.guestsCanViewProject,
              archivedAt: project.archivedAt,
              memberRole: project.members.find((p) => p.userId === m.userId)?.role ?? null,
            }
          : null,
    };
    if (canChannel(actor, policy, "channel.view")) out.add(m.userId);
  }
  return out;
}

/* ───────────────────────── people ───────────────────────── */

const personSelect = { id: true, name: true, email: true, image: true, kind: true } as const;
const authorSelect = { id: true, name: true, image: true, kind: true } as const;

/** Everyone who can take part in team chat: non-guest members and the AI teammate. */
export async function listPeople(ctx: WorkspaceCtx): Promise<Person[]> {
  if (ctx.role === "GUEST") return [];
  const rows = await db.workspaceMember.findMany({
    where: { workspaceId: ctx.workspace.id, status: "ACTIVE", role: { not: "GUEST" } },
    select: { user: { select: personSelect } },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => r.user).filter((u) => u.kind !== "SYSTEM");
}

/* ───────────────────────── sidebar ───────────────────────── */

function channelDisplayName(
  row: { kind: string; name: string | null; project: { name: string } | null },
  people: Array<{ name: string }>,
): string {
  if (row.kind === "PROJECT") return row.project?.name ?? row.name ?? "";
  if (row.kind === "DM") return people[0]?.name ?? row.name ?? "";
  if (row.kind === "GROUP_DM")
    return people.map((p) => p.name.split(" ")[0] ?? p.name).join(", ") || (row.name ?? "");
  return row.name ?? "";
}

/**
 * Channels for the Messages sidebar with unread counts. Project channels
 * need no membership row: a missing row means "never opened", and counts
 * start from when the person joined the workspace.
 */
export async function listSidebarChannels(ctx: WorkspaceCtx): Promise<ChannelList> {
  if (ctx.role === "GUEST") return { projects: [], channels: [], dms: [] };
  const me = ctx.actor.userId;
  const projectRows = await db.channel.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      kind: "PROJECT",
      archivedAt: null,
      project: { ...accessibleProjectsWhere(ctx), archivedAt: null },
    },
    select: channelAccessSelect(me),
  });
  const joinedRows = await db.channel.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      kind: { in: ["CUSTOM", "DM", "GROUP_DM"] },
      archivedAt: null,
      members: { some: { userId: me, hiddenAt: null } },
    },
    select: channelAccessSelect(me),
  });
  const rows = [...projectRows, ...joinedRows].filter((r) =>
    canChannel(ctx.policyActor, toPolicyChannel(r), "channel.view"),
  );
  if (rows.length === 0) return { projects: [], channels: [], dms: [] };
  const dmIds = rows.filter((r) => r.kind === "DM" || r.kind === "GROUP_DM").map((r) => r.id);
  const [participants, membership] = await Promise.all([
    dmIds.length
      ? db.channelMember.findMany({
          where: { channelId: { in: dmIds }, userId: { not: me } },
          select: { channelId: true, user: { select: authorSelect } },
          orderBy: { joinedAt: "asc" },
        })
      : Promise.resolve([]),
    db.workspaceMember.findFirst({
      where: { workspaceId: ctx.workspace.id, userId: me },
      select: { joinedAt: true },
    }),
  ]);
  const counts = await unreadCounts(
    rows.map((r) => r.id),
    me,
    membership?.joinedAt ?? new Date(0),
  );
  const mentions = await mentionCounts(ctx);

  const toItem = (r: ChannelAccessRow): ChannelListItem => {
    const people = participants.filter((p) => p.channelId === r.id).map((p) => p.user);
    return {
      id: r.id,
      kind: r.kind,
      name: channelDisplayName(r, people),
      isPrivate: r.isPrivate,
      project: r.project
        ? {
            id: r.project.id,
            identifier: r.project.identifier,
            name: r.project.name,
            color: r.project.color,
          }
        : null,
      people,
      unread: counts.get(r.id) ?? 0,
      mentions: mentions.get(r.id) ?? 0,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
    };
  };
  const byName = (a: ChannelListItem, b: ChannelListItem) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  const byRecent = (a: ChannelListItem, b: ChannelListItem) => {
    const x = a.lastMessageAt ?? "";
    const y = b.lastMessageAt ?? "";
    return x < y ? 1 : x > y ? -1 : 0;
  };
  return {
    projects: rows
      .filter((r) => r.kind === "PROJECT")
      .map(toItem)
      .sort(byName),
    channels: rows
      .filter((r) => r.kind === "CUSTOM")
      .map(toItem)
      .sort(byName),
    dms: rows
      .filter((r) => r.kind === "DM" || r.kind === "GROUP_DM")
      .map(toItem)
      .sort(byRecent),
  };
}

/**
 * Unread = top-level messages by someone else, newer than the reader's
 * `lastReadAt` (or, without a membership row, than `since`). Thread replies
 * are tracked per thread (ThreadFollower) and reach the Inbox instead.
 */
export async function unreadCounts(
  channelIds: string[],
  userId: string,
  since: Date,
): Promise<Map<string, number>> {
  if (channelIds.length === 0) return new Map();
  const rows = await db.$queryRaw<Array<{ channelId: string; n: number }>>`
    SELECT m."channelId", count(*)::int AS n
    FROM messages m
    LEFT JOIN channel_members cm ON cm."channelId" = m."channelId" AND cm."userId" = ${userId}::uuid
    WHERE m."channelId" IN (${Prisma.join(channelIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND m."threadRootId" IS NULL
      AND m."deletedAt" IS NULL
      AND m."authorId" IS DISTINCT FROM ${userId}::uuid
      AND m."createdAt" > COALESCE(cm."lastReadAt", ${since})
    GROUP BY m."channelId"`;
  return new Map(rows.map((r) => [r.channelId, r.n]));
}

async function mentionCounts(ctx: WorkspaceCtx): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<Array<{ channelId: string | null; n: number }>>`
    SELECT data->>'channelId' AS "channelId", count(*)::int AS n
    FROM notifications
    WHERE "recipientId" = ${ctx.actor.userId}::uuid
      AND "workspaceId" = ${ctx.workspace.id}::uuid
      AND type = 'MENTION'
      AND "messageId" IS NOT NULL
      AND "readAt" IS NULL
      AND "archivedAt" IS NULL
    GROUP BY 1`;
  return new Map(rows.filter((r) => r.channelId).map((r) => [r.channelId ?? "", r.n]));
}

/** Public custom channels anyone may join ("Browse channels"). */
export async function listBrowsableChannels(ctx: WorkspaceCtx): Promise<BrowsableChannel[]> {
  if (ctx.role === "GUEST") return [];
  const rows = await db.channel.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      kind: "CUSTOM",
      archivedAt: null,
      OR: [{ isPrivate: false }, { members: { some: { userId: ctx.actor.userId } } }],
    },
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { members: true } },
      members: { where: { userId: ctx.actor.userId }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "",
    description: r.description,
    memberCount: r._count.members,
    joined: r.members.length > 0,
  }));
}

/* ───────────────────────── one channel ───────────────────────── */

export async function getChannelDetail(
  ctx: WorkspaceCtx,
  channelId: string,
): Promise<ChannelDetail> {
  const access = await channelAccessById(ctx, channelId);
  const c = access.channel;
  let members: ChannelDetail["members"];
  if (c.kind === "PROJECT" && c.project) {
    // Everyone with a member-or-better role in the project.
    const where: Prisma.WorkspaceMemberWhereInput =
      c.project.visibility === "PRIVATE"
        ? {
            workspaceId: ctx.workspace.id,
            status: "ACTIVE",
            role: { not: "GUEST" },
            OR: [
              { role: { in: ["OWNER", "ADMIN"] } },
              {
                user: {
                  projectMemberships: {
                    some: { projectId: c.project.id, role: { in: ["ADMIN", "MEMBER"] } },
                  },
                },
              },
            ],
          }
        : { workspaceId: ctx.workspace.id, status: "ACTIVE", role: { not: "GUEST" } };
    const rows = await db.workspaceMember.findMany({
      where,
      select: { user: { select: personSelect } },
      orderBy: { user: { name: "asc" } },
    });
    members = rows.map((r) => ({ ...r.user, role: null }));
  } else {
    const rows = await db.channelMember.findMany({
      where: { channelId: c.id },
      select: { role: true, user: { select: personSelect } },
      orderBy: { user: { name: "asc" } },
    });
    members = rows.map((r) => ({ ...r.user, role: r.role }));
  }
  const others = members.filter((m) => m.id !== ctx.actor.userId);
  return {
    id: c.id,
    kind: c.kind,
    name: channelDisplayName(c, others),
    topic: c.topic,
    description: c.description,
    isPrivate: c.isPrivate,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    project: c.project
      ? {
          id: c.project.id,
          identifier: c.project.identifier,
          name: c.project.name,
          color: c.project.color,
        }
      : null,
    members: members.filter((m) => m.kind !== "SYSTEM"),
    openToWorkspace: c.kind === "CUSTOM" && !c.isPrivate,
    lastReadAt: c.members[0]?.lastReadAt?.toISOString() ?? null,
    can: {
      post: access.can("channel.post"),
      manage: access.can("channel.manage"),
      join: access.can("channel.join") && c.kind === "CUSTOM",
      leave: access.can("channel.leave"),
      addMembers: access.can("channel.members"),
    },
    me: ctx.actor.userId,
  };
}

/* ───────────────────────── messages ───────────────────────── */

const messageSelect = {
  id: true,
  channelId: true,
  threadRootId: true,
  kind: true,
  body: true,
  replyCount: true,
  lastReplyAt: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  author: { select: authorSelect },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" } },
  attachments: {
    where: { deletedAt: null, status: "READY" },
    select: { id: true, filename: true, mimeType: true, size: true },
    orderBy: { createdAt: "asc" },
  },
  references: {
    where: { kind: "CREATED_FROM", workItem: { deletedAt: null } },
    select: {
      workItem: {
        select: {
          id: true,
          sequence: true,
          title: true,
          stateGroup: true,
          projectId: true,
          state: { select: { color: true } },
          project: { select: { identifier: true } },
        },
      },
    },
  },
} satisfies Prisma.MessageSelect;
type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

function toMessageView(m: MessageRow, visibleProjects: Set<string>): MessageView {
  const grouped = new Map<string, string[]>();
  for (const r of m.reactions) grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.userId]);
  const deleted = Boolean(m.deletedAt);
  return {
    id: m.id,
    channelId: m.channelId,
    threadRootId: m.threadRootId,
    kind: m.kind,
    author: m.author,
    body: deleted ? null : m.body,
    deleted,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    replyCount: m.replyCount,
    lastReplyAt: m.lastReplyAt?.toISOString() ?? null,
    reactions: deleted
      ? []
      : [...grouped.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
    attachments: deleted ? [] : m.attachments,
    createdItems: m.references
      .filter((r) => visibleProjects.has(r.workItem.projectId))
      .map((r) => ({
        id: r.workItem.id,
        identifier: formatIdentifier(r.workItem.project.identifier, r.workItem.sequence),
        title: r.workItem.title,
        stateGroup: r.workItem.stateGroup,
        stateColor: r.workItem.state.color,
      })),
  };
}

async function visibleProjectIds(ctx: WorkspaceCtx): Promise<Set<string>> {
  const rows = await db.project.findMany({
    where: accessibleProjectsWhere(ctx),
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** `#INFRA-42` chips: resolve referenced items the reader may see. */
async function resolveRefs(
  ctx: WorkspaceCtx,
  bodies: unknown[],
): Promise<Record<string, ItemRefInfo>> {
  const ids = [...new Set(bodies.flatMap((b) => extractItemRefs(b as PMNode | null)))].filter(
    (id) => /^[0-9a-f-]{36}$/.test(id),
  );
  if (ids.length === 0) return {};
  const items = await db.workItem.findMany({
    where: {
      id: { in: ids.slice(0, 500) },
      workspaceId: ctx.workspace.id,
      deletedAt: null,
      project: accessibleProjectsWhere(ctx),
    },
    select: {
      id: true,
      sequence: true,
      title: true,
      stateGroup: true,
      state: { select: { color: true } },
      project: { select: { identifier: true } },
    },
  });
  return Object.fromEntries(
    items
      // Requests still in triage have no number; they stay plain text.
      .filter((i) => i.sequence !== null)
      .map((i) => [
        i.id,
        {
          id: i.id,
          identifier: formatIdentifier(i.project.identifier, i.sequence),
          title: i.title,
          stateGroup: i.stateGroup,
          stateColor: i.state.color,
        },
      ]),
  );
}

export const PAGE_SIZE = 50;

/** Cursor `<createdAt ISO>|<id>`. */
function parseCursor(cursor: string | null): { at: Date; id: string } | null {
  if (!cursor) return null;
  const [at, id] = cursor.split("|");
  if (!at || !id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : { at: d, id };
}

/** Top-level messages, newest page first; returned oldest → newest. */
export async function listChannelMessages(
  ctx: WorkspaceCtx,
  channelId: string,
  opts: { before?: string | null; limit?: number } = {},
): Promise<MessagePage> {
  await channelAccessById(ctx, channelId);
  const before = parseCursor(opts.before ?? null);
  const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), 200);
  const rows = await db.message.findMany({
    where: {
      channelId,
      threadRootId: null,
      // Deleted messages disappear unless a thread hangs off them.
      OR: [{ deletedAt: null }, { replyCount: { gt: 0 } }],
      ...(before
        ? {
            AND: [
              {
                OR: [
                  { createdAt: { lt: before.at } },
                  { createdAt: before.at, id: { lt: before.id } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: messageSelect,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  const [projects, refs] = await Promise.all([
    visibleProjectIds(ctx),
    resolveRefs(
      ctx,
      page.map((m) => m.body),
    ),
  ]);
  const oldest = page[0];
  return {
    messages: page.map((m) => toMessageView(m, projects)),
    refs,
    older: hasMore && oldest ? `${oldest.createdAt.toISOString()}|${oldest.id}` : null,
  };
}

export async function getThread(ctx: WorkspaceCtx, rootId: string): Promise<ThreadView> {
  const root = await db.message.findFirst({
    where: { id: rootId, workspaceId: ctx.workspace.id, threadRootId: null },
    select: messageSelect,
  });
  if (!root) throw new NotFoundError();
  await channelAccessById(ctx, root.channelId);
  const [replies, follower, projects] = await Promise.all([
    db.message.findMany({
      where: { threadRootId: root.id, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 1000,
      select: messageSelect,
    }),
    db.threadFollower.findUnique({
      where: { messageId_userId: { messageId: root.id, userId: ctx.actor.userId } },
      select: { userId: true },
    }),
    visibleProjectIds(ctx),
  ]);
  const refs = await resolveRefs(ctx, [root.body, ...replies.map((r) => r.body)]);
  return {
    root: toMessageView(root, projects),
    replies: replies.map((r) => toMessageView(r, projects)),
    refs,
    following: Boolean(follower),
  };
}
