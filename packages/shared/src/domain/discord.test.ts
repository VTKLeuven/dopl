import { describe, expect, it } from "vitest";
import { escapeMarkdown, renderDiscordMessage, type DiscordEntity } from "./discord";
import { isAllowedWebhookUrl, webhookUrlHint } from "../schemas/webhooks";

const entity: DiscordEntity = {
  kind: "work_item",
  identifier: "INFRA-42",
  title: "Printer on floor 2 @everyone [click](https://evil.test)",
  url: "https://dopl.vtk.be/vtk/i/INFRA-42",
  projectName: "Infrastructure",
  stateName: "In progress",
  stateGroup: "STARTED",
  priority: "HIGH",
  assignees: ["Bram"],
  description: "Secret details",
  submitter: "someone@example.com",
};

describe("discord messages", () => {
  it("never resolves mentions and escapes untrusted markdown", () => {
    const msg = renderDiscordMessage({
      appUrl: "https://dopl.vtk.be",
      workspaceName: "VTK IT",
      events: [{ type: "work_item.created", at: "2026-09-29T10:00:00.000Z" }],
      entity,
      includeContent: false,
    });
    expect(msg.allowed_mentions.parse).toEqual([]);
    const embed = msg.embeds[0]!;
    expect(embed.title).toContain("INFRA-42 · ");
    expect(embed.url).toBe(entity.url);
    expect(embed.color).toBe(0xd97706);
    expect(embed.author?.name).toBe("New work item");
  });
  it("leaves content out unless the webhook includes it", () => {
    const base = {
      appUrl: "https://dopl.vtk.be",
      workspaceName: "VTK IT",
      events: [{ type: "intake.submitted" as const, at: "2026-09-29T10:00:00.000Z" }],
      entity,
    };
    const off = renderDiscordMessage({ ...base, includeContent: false });
    expect(JSON.stringify(off)).not.toContain("Secret details");
    expect(JSON.stringify(off)).not.toContain("someone@example.com");
    const on = renderDiscordMessage({ ...base, includeContent: true });
    expect(on.embeds[0]?.description).toContain("Secret details");
  });
  it("posts email threads without pinging anyone, content only when included", () => {
    const email: DiscordEntity = {
      kind: "email_thread",
      identifier: "IT mailbox",
      title: "@everyone urgent: printer down @here",
      url: "https://dopl.vtk.be/vtk/mail?thread=t1",
      projectName: "it@vtk.be",
      assignees: [],
      description: "Private details from the sender",
      submitter: "Lotte <lotte@example.test>",
    };
    const at = "2026-09-29T10:00:00.000Z";
    const created = renderDiscordMessage({
      appUrl: "https://dopl.vtk.be",
      workspaceName: "VTK IT",
      events: [{ type: "email_thread.created", at }],
      entity: email,
      includeContent: false,
    });
    expect(created.allowed_mentions.parse).toEqual([]);
    expect(created.embeds[0]?.author?.name).toBe("New email");
    expect(created.embeds[0]?.footer?.text).toContain("it@vtk.be");
    expect(JSON.stringify(created)).not.toContain("Private details");
    expect(JSON.stringify(created)).not.toContain("lotte@example.test");
    const reply = renderDiscordMessage({
      appUrl: "https://dopl.vtk.be",
      workspaceName: "VTK IT",
      events: [{ type: "email_message.received", at }],
      entity: email,
      includeContent: true,
    });
    expect(reply.embeds[0]?.author?.name).toBe("New reply");
    expect(reply.embeds[0]?.description).toContain("Private details");
  });

  it("summarises coalesced updates with the latest state", () => {
    const msg = renderDiscordMessage({
      appUrl: "https://dopl.vtk.be",
      workspaceName: "VTK IT",
      events: [
        { type: "work_item.state_changed", at: "1", detail: { to: "Todo" } },
        { type: "work_item.assigned", at: "2" },
        { type: "work_item.state_changed", at: "3", detail: { to: "In review" } },
      ],
      entity,
      includeContent: false,
    });
    expect(msg.embeds[0]?.author?.name).toBe("Moved to In review · Assigned");
  });
  it("truncates to Discord's limits", () => {
    const msg = renderDiscordMessage({
      appUrl: "https://dopl.vtk.be",
      workspaceName: "VTK IT",
      events: [{ type: "work_item.created", at: "1" }],
      entity: { ...entity, title: "x".repeat(1000), description: "y".repeat(9000) },
      includeContent: true,
    });
    expect(msg.embeds[0]?.title?.length).toBeLessThanOrEqual(256);
    expect(msg.embeds[0]?.description?.length).toBeLessThanOrEqual(4096);
  });
  it("escapes markdown and breaks @mentions", () => {
    expect(escapeMarkdown("[a](b) *x* @here")).toBe("\\[a\\]\\(b\\) \\*x\\* @​here");
  });
});

describe("webhook urls", () => {
  it("allows only Discord (and localhost in development)", () => {
    const discord = "https://discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz_-12";
    expect(isAllowedWebhookUrl(discord, { allowLocal: false })).toBe(true);
    expect(isAllowedWebhookUrl("https://evil.test/api/webhooks/1/abc", { allowLocal: false })).toBe(
      false,
    );
    expect(isAllowedWebhookUrl("http://169.254.169.254/latest", { allowLocal: true })).toBe(false);
    expect(isAllowedWebhookUrl("http://localhost:4545/hook", { allowLocal: false })).toBe(false);
    expect(isAllowedWebhookUrl("http://localhost:4545/hook", { allowLocal: true })).toBe(true);
    expect(webhookUrlHint(discord)).toBe("…/123456789012/abcd…_-12");
  });
});
