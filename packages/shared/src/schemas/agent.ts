/**
 * Inputs for the AI teammate (Phase 8): settings forms, approvals, run
 * control and the MCP tools' arguments. Every boundary parses with these.
 */
import { z } from "zod";
import { checkPattern, MAX_COMMAND_LENGTH, MCP_SCOPES } from "../domain/agent";

const name = z.string().trim().min(1).max(80);

export const AgentProfileSchema = z.object({
  name: name,
  baseUrl: z.url().max(300),
  /** The env var in worker.env holding the runtime's bearer key. */
  apiKeyEnv: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  model: z.string().trim().max(120).optional().nullable(),
  instructions: z.string().max(8000).optional().nullable(),
  runTimeoutSec: z
    .number()
    .int()
    .min(60)
    .max(4 * 3600),
  approvalTimeoutSec: z
    .number()
    .int()
    .min(60)
    .max(24 * 3600),
  /** Characters of trusted context sent with a request (D-118). */
  contextBudgetChars: z.number().int().min(2000).max(400_000),
});
export type AgentProfileInput = z.infer<typeof AgentProfileSchema>;

export const AgentStatusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });

export const AgentPauseSchema = z.object({ paused: z.boolean() });

export const AgentHostSchema = z.object({
  id: z.uuid().optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9._-]*$/i),
  hostname: z.string().trim().min(1).max(253),
  warpgateTarget: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[\w.-]+$/),
  environment: z.enum(["PRODUCTION", "STAGING", "LAB"]),
  description: z.string().trim().max(500).optional().nullable(),
  enabled: z.boolean(),
  alwaysRequireApproval: z.boolean(),
});
export type AgentHostInput = z.infer<typeof AgentHostSchema>;

export const CommandRuleSchema = z
  .object({
    id: z.uuid().optional(),
    kind: z.enum(["ALLOW_READONLY", "DENY"]),
    pattern: z.string().trim().min(1).max(500),
    description: z.string().trim().max(300).optional().nullable(),
    hostId: z.uuid().nullable(),
    enabled: z.boolean(),
  })
  .superRefine((r, ctx) => {
    const check = checkPattern(r.pattern, r.kind);
    if (!check.ok) ctx.addIssue({ code: "custom", path: ["pattern"], message: check.reason });
  });
export type CommandRuleInput = z.infer<typeof CommandRuleSchema>;

export const RuleTestSchema = z.object({
  hostId: z.uuid().nullable(),
  command: z.string().min(1).max(MAX_COMMAND_LENGTH),
  tainted: z.boolean().default(false),
});

export const McpTokenSchema = z.object({
  name: name,
  scopes: z.array(z.enum(MCP_SCOPES)).min(1),
  projectIds: z.array(z.uuid()).max(200),
  expiresInDays: z.number().int().min(1).max(3650).nullable(),
});

export const ApprovalDecisionSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["APPROVE", "DENY"]),
  note: z.string().trim().max(500).optional(),
});

export const StopRunSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().max(300).optional(),
});

export const AskAgentSchema = z.object({
  workItemId: z.uuid(),
  /** Assigning an untrusted item needs this explicit confirmation (D-033). */
  confirmUntrusted: z.boolean().default(false),
});

export const AuditFilterSchema = z.object({
  action: z.string().trim().max(80).optional(),
  actorId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.string().max(80).optional(),
});
export type AuditFilter = z.infer<typeof AuditFilterSchema>;

/* ───────────────────────── MCP tool arguments ───────────────────────── */

export const runToken = z
  .string()
  .min(20)
  .max(200)
  .describe("The run_token from your instructions");

export const McpTools = {
  search_work_items: {
    run_token: runToken,
    query: z.string().max(200).optional().describe("Words in the title or identifier"),
    project: z.string().max(12).optional().describe("Project identifier, e.g. INFRA"),
    assigned_to_me: z.boolean().optional(),
    include_done: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  get_work_item: {
    run_token: runToken,
    identifier: z.string().max(40).describe("e.g. INFRA-42"),
  },
  create_work_item: {
    run_token: runToken,
    project: z.string().max(12).describe("Project identifier, e.g. INFRA"),
    title: z.string().min(1).max(300),
    description: z.string().max(20_000).optional().describe("Plain text"),
    priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"]).optional(),
  },
  update_work_item: {
    run_token: runToken,
    identifier: z.string().max(40),
    title: z.string().min(1).max(300).optional(),
    state: z.string().max(60).optional().describe("Name of a workflow state in the project"),
    priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"]).optional(),
  },
  add_comment: {
    run_token: runToken,
    identifier: z.string().max(40),
    body: z.string().min(1).max(20_000).describe("Plain text; blank lines separate paragraphs"),
  },
  list_assigned_threads: { run_token: runToken },
  get_email_thread: { run_token: runToken, thread_id: z.uuid() },
  list_hosts: { run_token: runToken },
  infra_exec: {
    run_token: runToken,
    host: z.string().max(64).describe("Host name from list_hosts"),
    command: z.string().min(1).max(MAX_COMMAND_LENGTH).describe("One shell command line"),
    reason: z.string().max(1000).describe("Why this command is needed, for the approver"),
  },
  infra_wait: { run_token: runToken, approval_id: z.uuid() },
} as const;
export type McpToolName = keyof typeof McpTools;
