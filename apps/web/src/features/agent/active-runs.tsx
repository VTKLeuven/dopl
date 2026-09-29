"use client";

import { isActiveRun, useChannelRuns } from "./data";
import { RunCard } from "./run-card";

/**
 * Above a conversation's composer: Dopl's runs that are still going, with
 * their live steps, approvals and Stop. Finished runs leave; their answer
 * is a message in the conversation.
 */
export function ActiveRuns({
  ws,
  channelId,
  enabled,
}: {
  ws: string;
  channelId: string;
  enabled: boolean;
}) {
  const runs = useChannelRuns(ws, channelId, enabled).data ?? [];
  const active = runs.filter((r) => isActiveRun(r.status));
  if (active.length === 0) return null;
  return (
    <ul
      className="mb-2 flex max-h-[50dvh] flex-col gap-2 overflow-y-auto"
      data-testid="active-runs"
    >
      {active.map((r) => (
        <RunCard key={r.id} ws={ws} run={r} variant="compact" />
      ))}
    </ul>
  );
}
