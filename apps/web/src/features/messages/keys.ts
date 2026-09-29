/** Messages query keys (one place; realtime invalidates by these). */
export const chatKeys = {
  all: (ws: string) => ["chat", ws] as const,
  channels: (ws: string) => ["chat", ws, "channels"] as const,
  browse: (ws: string) => ["chat", ws, "browse"] as const,
  people: (ws: string) => ["chat", ws, "people"] as const,
  channel: (ws: string, id: string) => ["chat", ws, "channel", id] as const,
  messages: (ws: string, channelId: string) => ["chat", ws, "messages", channelId] as const,
  thread: (ws: string, rootId: string) => ["chat", ws, "thread", rootId] as const,
};
