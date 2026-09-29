/** Query keys for the AI teammate; shared by server prefetch and client hooks. */
export const agentKeys = {
  all: (ws: string) => ["agent", ws] as const,
  run: (ws: string, id: string) => ["agent", ws, "run", id] as const,
  activity: (ws: string) => ["agent", ws, "activity"] as const,
  channel: (ws: string, channelId: string) => ["agent", ws, "channel", channelId] as const,
};
