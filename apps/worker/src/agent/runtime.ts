/**
 * The agent runtime behind Dopl's AI teammate (ARCHITECTURE §8.2). Dopl only
 * talks to it through this interface, so swapping Hermes for another
 * runtime means one new adapter.
 */

export interface RuntimeCapabilities {
  ok: boolean;
  model: string | null;
  /** Feature flags the runtime reported. */
  features: Record<string, unknown>;
  /** Required features that are missing (empty when ok). */
  missing: string[];
}

export interface StartRunInput {
  /** AgentRun.id → Idempotency-Key. */
  runId: string;
  /** e.g. dopl:workItem:<id>: one conversation per item or DM. */
  sessionId: string;
  /** Stable memory scope. */
  sessionKey: string;
  /** System prompt, including the run_token and the rules. */
  instructions: string;
  /** The person's request plus trusted context. */
  input: string;
  model?: string | null;
}

export type RuntimeEvent =
  | { type: "message.delta"; text: string }
  | { type: "message.interim"; text: string }
  | { type: "tool.started"; tool: string; preview: string }
  | { type: "tool.completed"; tool: string; error: boolean; preview: string; durationSec: number }
  | { type: "approval.requested"; requestId: string; tool: string; description: string }
  | { type: "approval.cancelled"; requestId: string; reason: string }
  | { type: "run.completed"; output: string; usage?: unknown }
  | { type: "run.failed" | "run.cancelled" | "run.interrupted"; error?: string };

export type RuntimeRunStatus =
  | { status: "running" | "waiting_for_approval" | "stopping" | "started" }
  | { status: "completed"; output: string; usage?: unknown }
  | { status: "failed" | "cancelled" | "interrupted"; error?: string }
  | { status: "unknown" };

export interface AgentRuntime {
  readonly kind: "HERMES";
  capabilities(): Promise<RuntimeCapabilities>;
  startRun(input: StartRunInput): Promise<{ runtimeRunId: string }>;
  events(runtimeRunId: string, signal: AbortSignal): AsyncIterable<RuntimeEvent>;
  resolveApproval(runtimeRunId: string, requestId: string, choice: "once" | "deny"): Promise<void>;
  stop(runtimeRunId: string): Promise<void>;
  status(runtimeRunId: string): Promise<RuntimeRunStatus>;
}

/** The runtime said "not now" (e.g. 429: too many concurrent runs). */
export class RuntimeBusyError extends Error {}
/** The runtime is unreachable or answered unexpectedly; the job may retry. */
export class RuntimeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
