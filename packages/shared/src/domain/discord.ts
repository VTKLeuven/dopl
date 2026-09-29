/**
 * Renders Dopl events as a Discord webhook message (D-052). Pure, so it's
 * unit-tested; the worker loads the entity and posts the result.
 *
 * Safety: `allowed_mentions.parse = []` means text like "@everyone" in an
 * email subject can never ping anyone, and untrusted text is markdown-escaped
 * so it can't smuggle in masked links.
 */
import type { WebhookEvent } from "../schemas/webhooks";

export interface DiscordEntity {
  kind: "work_item" | "intake" | "email_thread";
  /** "INFRA-42", "Intake #12", or the mailbox address for email */
  identifier: string;
  title: string;
  url: string;
  projectName: string;
  stateName?: string | null;
  stateGroup?: string | null;
  priority?: string | null;
  assignees?: string[];
  /** Only sent when the webhook includes content. */
  description?: string | null;
  submitter?: string | null;
  source?: string | null;
}

export interface DiscordRenderInput {
  appUrl: string;
  workspaceName: string;
  events: Array<{ type: WebhookEvent; at: string; detail?: Record<string, unknown> }>;
  entity: DiscordEntity | null;
  includeContent: boolean;
  test?: boolean;
}

export interface DiscordMessage {
  username: string;
  avatar_url: string;
  allowed_mentions: { parse: never[] };
  embeds: Array<{
    title?: string;
    url?: string;
    description?: string;
    color?: number;
    author?: { name: string };
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  }>;
}

const GROUP_COLORS: Record<string, number> = {
  TRIAGE: 0x837ded,
  BACKLOG: 0xa1a1aa,
  UNSTARTED: 0x71717a,
  STARTED: 0xd97706,
  COMPLETED: 0x16a34a,
  CANCELLED: 0xdc2626,
};
const BRAND = 0x42b0ff;

const LIMITS = { title: 256, description: 4096, field: 1024, author: 256, footer: 2048 };

/** Escape Discord markdown so untrusted text renders literally. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>[\]()#-])/g, "\\$1").replace(/@/g, "@\u200b");
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  NONE: "No priority",
};

function summary(events: DiscordRenderInput["events"], entity: DiscordEntity): string {
  const types = new Set(events.map((e) => e.type));
  if (types.has("email_thread.created")) return "New email";
  if (types.has("email_message.received")) return "New reply";
  if (types.has("intake.submitted")) return "New request";
  if (types.has("intake.accepted")) return "Request accepted";
  if (types.has("work_item.created")) return "New work item";
  if (types.has("work_item.completed")) return "Completed";
  const parts: string[] = [];
  if (types.has("work_item.state_changed")) {
    const last = [...events].reverse().find((e) => e.type === "work_item.state_changed");
    const to = typeof last?.detail?.to === "string" ? last.detail.to : entity.stateName;
    parts.push(to ? `Moved to ${to}` : "State changed");
  }
  if (types.has("work_item.assigned")) parts.push("Assigned");
  return parts.join(" · ") || "Updated";
}

export function renderDiscordMessage(input: DiscordRenderInput): DiscordMessage {
  const avatar = `${input.appUrl}/brand/dopl-mark-192.png`;
  const base = {
    username: "Dopl",
    avatar_url: avatar,
    allowed_mentions: { parse: [] as never[] },
  };
  const at = input.events[input.events.length - 1]?.at ?? new Date().toISOString();

  if (input.test || !input.entity) {
    return {
      ...base,
      embeds: [
        {
          title: "Dopl is connected",
          url: input.appUrl,
          description: truncate(
            `This channel will get updates from ${escapeMarkdown(input.workspaceName)}.`,
            LIMITS.description,
          ),
          color: BRAND,
          footer: { text: truncate(input.workspaceName, LIMITS.footer) },
          timestamp: at,
        },
      ],
    };
  }

  const e = input.entity;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (e.stateName) fields.push({ name: "State", value: escapeMarkdown(e.stateName), inline: true });
  if (e.priority && e.priority !== "NONE")
    fields.push({
      name: "Priority",
      value: PRIORITY_LABEL[e.priority] ?? escapeMarkdown(e.priority),
      inline: true,
    });
  if (e.assignees?.length)
    fields.push({
      name: "Assignees",
      value: truncate(e.assignees.map(escapeMarkdown).join(", "), LIMITS.field),
      inline: true,
    });
  if (e.source) fields.push({ name: "Source", value: escapeMarkdown(e.source), inline: true });
  if (input.includeContent && e.submitter)
    fields.push({ name: "From", value: truncate(escapeMarkdown(e.submitter), LIMITS.field) });

  const description =
    input.includeContent && e.description
      ? truncate(escapeMarkdown(e.description), LIMITS.description)
      : undefined;

  return {
    ...base,
    embeds: [
      {
        author: { name: truncate(summary(input.events, e), LIMITS.author) },
        title: truncate(`${e.identifier} · ${e.title}`, LIMITS.title),
        url: e.url,
        ...(description ? { description } : {}),
        color: (e.stateGroup && GROUP_COLORS[e.stateGroup]) || BRAND,
        ...(fields.length ? { fields: fields.slice(0, 25) } : {}),
        footer: { text: truncate(`${e.projectName} · ${input.workspaceName}`, LIMITS.footer) },
        timestamp: at,
      },
    ],
  };
}
