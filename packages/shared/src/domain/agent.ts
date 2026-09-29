/**
 * The AI teammate's safety rules as pure functions (D-031, D-033), shared by
 * the MCP server (web), the executor (worker) and the rule tester in
 * Settings. Nothing here trusts the agent: commands are matched as whole
 * lines, compound commands never match a rule by accident, and a DENY rule
 * wins over everything, approval included.
 */
import { createHash, createHmac } from "node:crypto";

export type HostEnvironment = "PRODUCTION" | "STAGING" | "LAB";
export type CommandRuleKind = "ALLOW_READONLY" | "DENY";

export interface RuleLike {
  id: string;
  kind: CommandRuleKind;
  pattern: string;
  /** null = every host. */
  hostId: string | null;
  enabled: boolean;
}

export interface HostLike {
  id: string;
  enabled: boolean;
  environment: HostEnvironment;
  alwaysRequireApproval: boolean;
}

/** Longest command the agent may send; longer ones are refused outright. */
export const MAX_COMMAND_LENGTH = 4000;

/**
 * Collapses runs of spaces and tabs and trims the ends. Quotes are kept
 * as written: rules match what will actually run, so `ls  -la` and `ls -la`
 * are the same command but `ls '-la'` is not.
 */
export function normalizeCommand(command: string): string {
  return command.replace(/[ \t]+/g, " ").trim();
}

/**
 * Operators that chain, substitute or redirect. A command containing any of
 * them never matches an ALLOW_READONLY rule unless the rule itself spells
 * the operator out, because `docker ps; rm -rf /` must not pass as
 * `docker ps.*`.
 */
const COMPOUND = /[;&|`<>\n\r]|\$\(/;

export function isCompound(command: string): boolean {
  return COMPOUND.test(command);
}

/** True when a rule's pattern names a compound operator itself (escaped or in a class). */
function ruleAllowsCompound(pattern: string): boolean {
  return /[;&`<>]|\\\||\\\$|\\n/.test(pattern);
}

export type PatternCheck = { ok: true } | { ok: false; reason: "invalid" | "too_broad" };

/** Validates a rule pattern before it is saved (and again before use). */
export function checkPattern(pattern: string, kind: CommandRuleKind): PatternCheck {
  let re: RegExp;
  try {
    re = new RegExp(`^(?:${pattern})$`);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  // An allow rule that matches anything would switch approvals off.
  if (kind === "ALLOW_READONLY" && (re.test("") || re.test("rm -rf /") || re.test("x")))
    return { ok: false, reason: "too_broad" };
  return { ok: true };
}

/** Anchored, whole-line match. Invalid patterns never match. */
export function ruleMatches(rule: Pick<RuleLike, "pattern" | "kind">, command: string): boolean {
  const cmd = normalizeCommand(command);
  let re: RegExp;
  try {
    re = new RegExp(`^(?:${rule.pattern})$`);
  } catch {
    return false;
  }
  if (rule.kind === "ALLOW_READONLY" && isCompound(cmd) && !ruleAllowsCompound(rule.pattern))
    return false;
  return re.test(cmd);
}

/**
 * DENY rules also match any segment of a compound command, so `ls; reboot`
 * is caught by a rule for `reboot` even though the whole line isn't.
 */
function denyMatches(rule: RuleLike, command: string): boolean {
  if (ruleMatches(rule, command)) return true;
  return commandSegments(command).some((s) => ruleMatches(rule, s));
}

/** Splits on chaining operators; used for DENY matching and risk flags only. */
export function commandSegments(command: string): string[] {
  return normalizeCommand(command)
    .split(/\|\||&&|[;|&\n\r]|\$\(|`|\)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const DESTRUCTIVE: RegExp[] = [
  /\brm\s+(-\w*[rf]\w*\s+)+/,
  /\bmkfs(\.\w+)?\b/,
  /\bdd\s+.*\bof=/,
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\bsystemctl\s+(stop|disable|mask|restart|kill)\b/,
  /\bdocker\s+(rm|rmi|kill|stop|restart|prune|system\s+prune|volume\s+rm|network\s+rm)\b/,
  /\bdocker\s+compose\s+(down|rm|kill|stop|restart)\b/,
  /\bkill(all)?\s/,
  /\biptables\b|\bnft\s/,
  /\bchmod\s+(-R\s+)?[0-7]*7[0-7]*7\b/,
  /\bchown\s+-R\b/,
  /\b(drop|truncate)\s+(database|table|schema)\b/i,
  /\bzfs\s+destroy\b|\bpvesh\s+delete\b|\bqm\s+destroy\b/,
  />\s*\/(etc|boot|dev|usr)\//,
];

export type RiskFlag =
  | "untrusted_input"
  | "production_host"
  | "destructive_pattern"
  | "compound_command"
  | "privilege_escalation";

export function riskFlags(input: {
  command: string;
  environment?: HostEnvironment | null;
  tainted: boolean;
}): RiskFlag[] {
  const cmd = normalizeCommand(input.command);
  const flags: RiskFlag[] = [];
  if (input.tainted) flags.push("untrusted_input");
  if (input.environment === "PRODUCTION") flags.push("production_host");
  if (DESTRUCTIVE.some((re) => re.test(cmd))) flags.push("destructive_pattern");
  if (isCompound(cmd)) flags.push("compound_command");
  if (commandSegments(cmd).some((s) => /^(sudo|su|doas|pkexec)\b/.test(s)))
    flags.push("privilege_escalation");
  return flags;
}

export type InfraDenyReason =
  | "agent_paused"
  | "run_not_active"
  | "host_not_allowed"
  | "host_disabled"
  | "denied_by_rule"
  | "invalid_command";

export type InfraDecision =
  | { decision: "deny"; reason: InfraDenyReason; ruleId?: string }
  | { decision: "run"; ruleId: string }
  | { decision: "approve"; riskFlags: RiskFlag[] };

/**
 * D-031's order: deny (paused, run over, unknown/disabled host, DENY rule),
 * then run at once (clean run, host without forced approval, an ALLOW rule
 * matching the whole line), otherwise ask a human.
 */
export function evaluateInfraExec(input: {
  paused: boolean;
  runActive: boolean;
  host: HostLike | null;
  rules: RuleLike[];
  command: string;
  tainted: boolean;
}): InfraDecision {
  const command = normalizeCommand(input.command);
  if (input.paused) return { decision: "deny", reason: "agent_paused" };
  if (!input.runActive) return { decision: "deny", reason: "run_not_active" };
  if (!input.host) return { decision: "deny", reason: "host_not_allowed" };
  if (!input.host.enabled) return { decision: "deny", reason: "host_disabled" };
  if (!command || command.length > MAX_COMMAND_LENGTH || command.includes("\0"))
    return { decision: "deny", reason: "invalid_command" };
  const hostId = input.host.id;
  const applicable = input.rules.filter(
    (r) => r.enabled && (r.hostId === null || r.hostId === hostId),
  );
  const deny = applicable.find((r) => r.kind === "DENY" && denyMatches(r, command));
  if (deny) return { decision: "deny", reason: "denied_by_rule", ruleId: deny.id };
  if (!input.tainted && !input.host.alwaysRequireApproval) {
    const allow = applicable.find((r) => r.kind === "ALLOW_READONLY" && ruleMatches(r, command));
    if (allow) return { decision: "run", ruleId: allow.id };
  }
  return {
    decision: "approve",
    riskFlags: riskFlags({
      command,
      environment: input.host.environment,
      tainted: input.tainted,
    }),
  };
}

/* ───────────────────────── secrets in output ───────────────────────── */

const REDACTIONS: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    "[REDACTED PRIVATE KEY]",
  ],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]"],
  [/\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/g, "[REDACTED JWT]"],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, "[REDACTED AWS KEY]"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, "[REDACTED TOKEN]"],
  [/\bglpat-[\w-]{20,}\b/g, "[REDACTED TOKEN]"],
  [/\bxox[abprs]-[\w-]{10,}\b/g, "[REDACTED TOKEN]"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED TOKEN]"],
  // scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, "$1[REDACTED]@"],
  // KEY=value, "password": "value", secret: value
  [
    /(["']?\b[\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credentials?)\b["']?\s*[:=]\s*)(["']?)[^\s"',;]{3,}\2/gi,
    "$1$2[REDACTED]$2",
  ],
];

/**
 * Masks likely secrets in command output before it is stored, shown or
 * streamed (ARCHITECTURE §8.4). Deliberately eager: a masked harmless value
 * costs little, a leaked token costs a rotation.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [re, replacement] of REDACTIONS)
    out = out.replace(re, replacement as string);
  return out;
}

/* ───────────────────────── run tokens ───────────────────────── */

/**
 * The per-run capability token the agent passes to every Dopl MCP tool
 * (D-032). It is derived, never stored: HMAC(key, run id). Web stores only
 * its SHA-256 when it queues the run; the worker derives the same token when
 * it writes the run's instructions, so a retried start sends the identical
 * payload (Hermes' idempotency check compares payloads).
 */
export function deriveRunToken(secret: string, runId: string): string {
  return `dopl_run_${createHmac("sha256", secret).update(`agent-run:${runId}`).digest("base64url")}`;
}

export function runTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Prefix for MCP bearer tokens; shown in Settings so a leaked one is recognisable. */
export const MCP_TOKEN_PREFIX = "dopl_mcp_";

/** Scopes an MCP token can carry (ApiToken.scopes). */
export const MCP_SCOPES = [
  "work_items:read",
  "work_items:write",
  "comments:write",
  "email_threads:read_assigned",
  "infra:exec",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

/** Where a run was asked for, which sets its Hermes session (D-030). */
export function runSessionId(run: {
  workItemId: string | null;
  channelId: string | null;
  id: string;
}): string {
  if (run.workItemId) return `dopl:workItem:${run.workItemId}`;
  if (run.channelId) return `dopl:channel:${run.channelId}`;
  return `dopl:run:${run.id}`;
}

/** Approvals, runs and steps that can still change. */
export const ACTIVE_RUN_STATUSES = ["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"] as const;
export const TERMINAL_RUN_STATUSES = ["COMPLETED", "FAILED", "CANCELLED", "INTERRUPTED"] as const;
