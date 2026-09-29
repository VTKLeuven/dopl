import "server-only";
import { db } from "../db";
import { EPHEMERAL_CHANNEL } from "./listener";

/**
 * Fire-and-forget realtime signals that are never stored (typing
 * indicators, D-023). They go through the same LISTEN hub and the same
 * per-connection permission check as stored events, but carry no id, so a
 * reconnecting client never gets them replayed.
 */
export async function publishEphemeral(event: {
  workspaceId: string;
  topic: string;
  type: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const json = JSON.stringify(event);
  // NOTIFY payloads are capped at 8000 bytes; ephemeral events are tiny.
  if (Buffer.byteLength(json) > 7_000) throw new Error("ephemeral event too large");
  await db.$executeRaw`SELECT pg_notify(${EPHEMERAL_CHANNEL}, ${json})`;
}
