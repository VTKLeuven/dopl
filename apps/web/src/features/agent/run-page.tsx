"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bot, MessagesSquare, SquareKanban } from "lucide-react";
import type { AgentRunDetail } from "@/server/queries/agent";
import { PageHeader } from "@/components/shell/page-header";
import { useAgentRun } from "./data";
import { RunCard } from "./run-card";

/** One run in full: what Dopl was told, every step, approvals, the result. */
export function RunPage({ ws, run: initial }: { ws: string; run: AgentRunDetail }) {
  const t = useTranslations("agent");
  const run = useAgentRun(ws, initial.id).data ?? initial;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        crumbs={[
          { label: t("title"), href: `/${ws}/agent`, icon: <Bot /> },
          { label: t("run.crumb") },
        ]}
      />
      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4 px-4 py-6 md:px-10">
          {run.workItem ? (
            <Link
              href={`/${ws}/i/${run.workItem.identifier}` as never}
              className="inline-flex items-center gap-1.5 self-start text-small text-fg-muted hover:text-fg"
            >
              <SquareKanban className="size-3.5" aria-hidden />
              <span className="tabular">{run.workItem.identifier}</span>
              <span className="truncate">{run.workItem.title}</span>
            </Link>
          ) : run.channel ? (
            <Link
              href={`/${ws}/messages/c/${run.channel.id}` as never}
              className="inline-flex items-center gap-1.5 self-start text-small text-fg-muted hover:text-fg"
            >
              <MessagesSquare className="size-3.5" aria-hidden />
              {run.channel.name ?? t("run.directMessage")}
            </Link>
          ) : null}
          <ul className="flex flex-col">
            <RunCard ws={ws} run={run} variant="page" />
          </ul>
        </div>
      </div>
    </div>
  );
}
