import type { TagColor } from "../schemas/palette";

export type StateGroupName = "TRIAGE" | "BACKLOG" | "UNSTARTED" | "STARTED" | "COMPLETED" | "CANCELLED";

/** Default workflow for a new project (Q-15). Triage is hidden and fixed. */
export const defaultStates: Array<{ name: string; group: StateGroupName; color: string; isDefault?: boolean }> = [
  { name: "Triage", group: "TRIAGE", color: "#837DED" },
  { name: "Backlog", group: "BACKLOG", color: "#A1A1AA", isDefault: true },
  { name: "Todo", group: "UNSTARTED", color: "#71717A" },
  { name: "In progress", group: "STARTED", color: "#D97706" },
  { name: "In review", group: "STARTED", color: "#0A6CBA" },
  { name: "Done", group: "COMPLETED", color: "#16A34A" },
  { name: "Cancelled", group: "CANCELLED", color: "#DC2626" },
];

/** Workspace-wide work-item types (lucide icon names, tag colours). */
export const defaultWorkItemTypes: Array<{ name: string; icon: string; color: TagColor; isDefault?: boolean }> = [
  { name: "Task", icon: "square-check", color: "grey", isDefault: true },
  { name: "Bug", icon: "bug", color: "red" },
  { name: "Incident", icon: "siren", color: "orange" },
  { name: "Request", icon: "inbox", color: "blue" },
  { name: "Feature", icon: "sparkles", color: "purple" },
];

export const defaultLabels: Array<{ name: string; color: TagColor }> = [
  { name: "hardware", color: "amber" },
  { name: "network", color: "blue" },
  { name: "security", color: "red" },
  { name: "docs", color: "teal" },
];

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
