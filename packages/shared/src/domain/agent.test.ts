import { describe, expect, it } from "vitest";
import {
  checkPattern,
  deriveRunToken,
  evaluateInfraExec,
  isCompound,
  normalizeCommand,
  redactSecrets,
  riskFlags,
  ruleMatches,
  runTokenHash,
  type HostLike,
  type RuleLike,
} from "./agent";

const host: HostLike = {
  id: "h1",
  enabled: true,
  environment: "LAB",
  alwaysRequireApproval: false,
};
const rule = (kind: RuleLike["kind"], pattern: string, hostId: string | null = null): RuleLike => ({
  id: `${kind}:${pattern}`,
  kind,
  pattern,
  hostId,
  enabled: true,
});
const rules = [
  rule("ALLOW_READONLY", "docker ps( --format \\S+)?"),
  rule("ALLOW_READONLY", "uptime"),
  rule("DENY", "rm -rf /.*"),
  rule("DENY", "reboot"),
];
const base = { paused: false, runActive: true, host, rules, tainted: false };

describe("normalizeCommand", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeCommand("  docker   ps\t-a ")).toBe("docker ps -a");
  });
});

describe("ruleMatches", () => {
  it("matches the whole line only", () => {
    expect(ruleMatches(rule("ALLOW_READONLY", "docker ps"), "docker ps")).toBe(true);
    expect(ruleMatches(rule("ALLOW_READONLY", "docker ps"), "docker ps -a")).toBe(false);
    expect(ruleMatches(rule("ALLOW_READONLY", "docker ps"), "sudo docker ps")).toBe(false);
  });
  it("never lets a compound command through an allow rule", () => {
    const r = rule("ALLOW_READONLY", "docker ps.*");
    for (const c of [
      "docker ps; rm -rf /",
      "docker ps && reboot",
      "docker ps | sh",
      "docker ps `id`",
      "docker ps $(id)",
      "docker ps > /etc/passwd",
      "docker ps\nreboot",
      "docker ps & reboot",
    ]) {
      expect(isCompound(c)).toBe(true);
      expect(ruleMatches(r, c)).toBe(false);
    }
  });
  it("lets a rule that names the operator match it", () => {
    expect(ruleMatches(rule("ALLOW_READONLY", "journalctl -u \\w+ \\| tail"), "journalctl -u nginx | tail")).toBe(true);
  });
  it("treats an invalid regex as no match", () => {
    expect(ruleMatches(rule("ALLOW_READONLY", "docker ("), "docker (")).toBe(false);
  });
});

describe("checkPattern", () => {
  it("refuses invalid and catch-all allow rules", () => {
    expect(checkPattern("(", "DENY")).toEqual({ ok: false, reason: "invalid" });
    expect(checkPattern(".*", "ALLOW_READONLY")).toEqual({ ok: false, reason: "too_broad" });
    expect(checkPattern(".+", "ALLOW_READONLY")).toEqual({ ok: false, reason: "too_broad" });
    expect(checkPattern(".*", "DENY")).toEqual({ ok: true });
    expect(checkPattern("docker ps", "ALLOW_READONLY")).toEqual({ ok: true });
  });
});

describe("evaluateInfraExec", () => {
  it("runs an allowlisted read-only command at once", () => {
    expect(evaluateInfraExec({ ...base, command: "docker ps" })).toEqual({
      decision: "run",
      ruleId: "ALLOW_READONLY:docker ps( --format \\S+)?",
    });
  });
  it("asks for approval when the run is tainted, even for allowlisted commands (red team 1)", () => {
    const d = evaluateInfraExec({ ...base, tainted: true, command: "docker ps" });
    expect(d.decision).toBe("approve");
    expect(d.decision === "approve" && d.riskFlags).toContain("untrusted_input");
  });
  it("refuses hosts that aren't allowlisted (red team 2)", () => {
    expect(evaluateInfraExec({ ...base, host: null, command: "uptime" })).toEqual({
      decision: "deny",
      reason: "host_not_allowed",
    });
    expect(
      evaluateInfraExec({ ...base, host: { ...host, enabled: false }, command: "uptime" }),
    ).toEqual({ decision: "deny", reason: "host_disabled" });
  });
  it("denies DENY matches, including inside a compound command (red team 3)", () => {
    expect(evaluateInfraExec({ ...base, command: "reboot" }).decision).toBe("deny");
    expect(evaluateInfraExec({ ...base, command: "uptime && reboot" })).toMatchObject({
      decision: "deny",
      reason: "denied_by_rule",
    });
    expect(evaluateInfraExec({ ...base, tainted: true, command: "rm -rf /var" })).toMatchObject({
      decision: "deny",
    });
  });
  it("denies everything while paused or after the run ended (red team 4, 7)", () => {
    expect(evaluateInfraExec({ ...base, paused: true, command: "uptime" })).toMatchObject({
      reason: "agent_paused",
    });
    expect(evaluateInfraExec({ ...base, runActive: false, command: "uptime" })).toMatchObject({
      reason: "run_not_active",
    });
  });
  it("respects host-scoped rules and forced approval", () => {
    const scoped = [rule("ALLOW_READONLY", "df -h", "other")];
    expect(evaluateInfraExec({ ...base, rules: scoped, command: "df -h" }).decision).toBe(
      "approve",
    );
    expect(
      evaluateInfraExec({
        ...base,
        host: { ...host, alwaysRequireApproval: true, environment: "PRODUCTION" },
        command: "uptime",
      }),
    ).toEqual({ decision: "approve", riskFlags: ["production_host"] });
  });
  it("refuses empty and oversized commands", () => {
    expect(evaluateInfraExec({ ...base, command: "   " })).toMatchObject({
      reason: "invalid_command",
    });
    expect(evaluateInfraExec({ ...base, command: "x".repeat(5000) })).toMatchObject({
      reason: "invalid_command",
    });
  });
});

describe("riskFlags", () => {
  it("flags destructive, compound and sudo commands", () => {
    expect(riskFlags({ command: "docker compose down", tainted: false })).toEqual([
      "destructive_pattern",
    ]);
    expect(riskFlags({ command: "ls && sudo systemctl stop nginx", tainted: false })).toEqual([
      "destructive_pattern",
      "compound_command",
      "privilege_escalation",
    ]);
    expect(riskFlags({ command: "docker ps", tainted: false })).toEqual([]);
  });
});

describe("redactSecrets", () => {
  it("masks common secret shapes", () => {
    const out = redactSecrets(
      [
        "POSTGRES_PASSWORD=hunter22",
        '"api_key": "abcd1234efgh"',
        "Authorization: Bearer abcdefghijklmnop",
        "postgres://dopl:s3cret@db:5432/dopl",
        "token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
        "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----",
        "CONTAINER ID   IMAGE",
      ].join("\n"),
    );
    expect(out).not.toMatch(/hunter22|abcd1234efgh|abcdefghijklmnop|s3cret|ghp_abc|AAAA/);
    expect(out).toContain("CONTAINER ID   IMAGE");
    expect(out).toContain("postgres://dopl:[REDACTED]@db:5432/dopl");
  });
});

describe("run tokens", () => {
  it("are deterministic per run and differ between runs", () => {
    const a = deriveRunToken("k".repeat(32), "run-1");
    expect(a).toBe(deriveRunToken("k".repeat(32), "run-1"));
    expect(a).not.toBe(deriveRunToken("k".repeat(32), "run-2"));
    expect(a).not.toBe(deriveRunToken("j".repeat(32), "run-1"));
    expect(runTokenHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
