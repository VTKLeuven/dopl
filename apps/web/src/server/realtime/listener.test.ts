import { describe, expect, it } from "vitest";
import { makeMember, makeProject, makeWorkspace } from "../testing/fixtures";
import { db } from "../db";
import { sendMessage } from "../services/messages";
import { publishEphemeral } from "./ephemeral";
import { realtimeHub, type RealtimeMessage } from "./listener";

function collect(workspaceId: string) {
  const got: RealtimeMessage[] = [];
  const unsubscribe = realtimeHub.subscribe(workspaceId, (m) => got.push(m));
  const waitFor = async (pred: (m: RealtimeMessage) => boolean, ms = 5_000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const hit = got.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("timed out waiting for a realtime event");
  };
  return { got, waitFor, unsubscribe };
}

describe("realtime hub", () => {
  it("delivers stored events with an id and ephemeral ones without", async () => {
    const ws = await makeWorkspace();
    const ann = await makeMember(ws, "ADMIN", "Ann");
    const project = await makeProject(ann);
    const channel = await db.channel.findUniqueOrThrow({ where: { projectId: project.id } });
    const feed = collect(ws.id);
    try {
      // The LISTEN connection is lazy; give it a moment on first subscribe.
      await new Promise((r) => setTimeout(r, 300));
      await publishEphemeral({
        workspaceId: ws.id,
        topic: `channel:${channel.id}`,
        type: "typing",
        payload: { userId: ann.actor.userId, name: "Ann" },
      });
      const typing = await feed.waitFor((m) => m.type === "typing");
      expect(typing.id).toBeNull();
      expect(typing.payload).toMatchObject({ userId: ann.actor.userId });
      // Never stored, so never replayed.
      expect(await db.realtimeEvent.count({ where: { workspaceId: ws.id, type: "typing" } })).toBe(
        0,
      );

      await sendMessage(ann, {
        channelId: channel.id,
        body: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
        },
      });
      const created = await feed.waitFor((m) => m.type === "message.created");
      expect(created.id).toMatch(/^\d+$/);
      expect(created.topic).toBe(`channel:${channel.id}`);
      // Other workspaces don't hear it.
      expect(feed.got.every((m) => m.workspaceId === ws.id)).toBe(true);
    } finally {
      feed.unsubscribe();
    }
  });
});
