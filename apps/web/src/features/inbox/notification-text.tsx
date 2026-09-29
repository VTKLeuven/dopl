"use client";

import { useTranslations } from "next-intl";
import {
  AlarmClock,
  AtSign,
  Bot,
  CalendarClock,
  CircleDot,
  LifeBuoy,
  Mail,
  MessageSquare,
  MessagesSquare,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import type { StateGroup } from "@dopl/shared/schemas/work-item";
import { StateIcon } from "@/components/icons/state-icon";
import type { InboxRow } from "./data";

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export interface NotificationText {
  /** What it's about: the item, request, channel or email. */
  title: string;
  /** Where: INFRA-42, #general, Direct message, Request. */
  context: string | null;
  /** Who did what. */
  summary: string;
  /** Quoted content (comment, message), when there is one. */
  excerpt: string | null;
  /** Collapsed repeats ("3 updates"). */
  count: number;
}

/** Translated list and reader text for a notification row. */
export function useNotificationText() {
  const t = useTranslations("inbox");
  return (row: InboxRow): NotificationText => {
    const d = row.data;
    const actor = row.actor?.name ?? t("someone");
    const channel = str(d.channelName);
    const isMessage = Boolean(row.messageId && str(d.channelId));
    const context = isMessage
      ? channel
        ? `#${channel}`
        : t("directMessage")
      : row.type === "INTAKE_UPDATED" ||
          (row.type === "COMMENT" && row.entityType === "INTAKE_ITEM")
        ? t("yourRequest")
        : row.entityType === "EMAIL_THREAD"
          ? (str(d.mailbox) ?? row.identifier)
          : row.identifier;
    // Chat: the message itself is the title; the channel is the context.
    const title = isMessage
      ? (str(d.excerpt) ?? actor)
      : (str(d.title) ?? str(d.subject) ?? str(d.name) ?? t(`typeLabel.${row.type}`));
    const from = str(d.from) ?? actor;
    let summary: string;
    switch (row.type) {
      case "WORK_ITEM_UPDATED":
        summary = str(d.to)
          ? t("text.movedTo", { actor, to: str(d.to) ?? "" })
          : t("text.updated", { actor });
        break;
      case "COMMENT":
        summary =
          row.entityType === "INTAKE_ITEM"
            ? t("text.requestReply", { actor })
            : t("text.COMMENT", { actor });
        break;
      case "INTAKE_SUBMITTED":
      case "INTAKE_REPLY":
        summary = t(`text.${row.type}`, { from });
        break;
      case "INTAKE_UPDATED":
        summary = t("text.INTAKE_UPDATED", { status: str(d.status) ?? "other" });
        break;
      case "INTEGRATION_FAILED":
        summary = t("text.INTEGRATION_FAILED", { name: str(d.name) ?? "" });
        break;
      case "EMAIL_REPLY":
        summary = d.reopened ? t("text.EMAIL_REOPENED", { from }) : t("text.EMAIL_REPLY", { from });
        break;
      case "SNOOZE_ENDED":
        summary =
          row.entityType === "EMAIL_THREAD" ? t("text.SNOOZE_ENDED_EMAIL") : t("text.SNOOZE_ENDED");
        break;
      default:
        summary = t(`text.${row.type}`, { actor });
    }
    const count = typeof d.count === "number" ? d.count : 1;
    return { title, context, summary, excerpt: isMessage ? null : str(d.excerpt), count };
  };
}

/** Small type badge on the actor avatar. */
export function TypeGlyph({ row }: { row: InboxRow }) {
  const group = row.data.toGroup as StateGroup | undefined;
  if (row.type === "WORK_ITEM_UPDATED" && group) return <StateIcon group={group} size={12} />;
  const Icon =
    {
      MENTION: AtSign,
      EMAIL_MENTION: AtSign,
      ASSIGNED: UserPlus,
      EMAIL_ASSIGNED: Mail,
      EMAIL_REPLY: Mail,
      COMMENT: MessageSquare,
      THREAD_REPLY: MessagesSquare,
      INTAKE_SUBMITTED: LifeBuoy,
      INTAKE_REPLY: LifeBuoy,
      INTAKE_UPDATED: LifeBuoy,
      SNOOZE_ENDED: AlarmClock,
      DUE_SOON: CalendarClock,
      AGENT_APPROVAL_REQUESTED: Bot,
      AGENT_RUN_FINISHED: Bot,
      INTEGRATION_FAILED: TriangleAlert,
      WORK_ITEM_UPDATED: CircleDot,
    }[row.type] ?? CircleDot;
  return <Icon className="size-3 text-icon" aria-hidden />;
}
