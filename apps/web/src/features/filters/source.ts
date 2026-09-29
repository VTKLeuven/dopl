import type { FilterField } from "@dopl/shared/schemas/filters";
import type { LabelMeta, MemberMeta, StateMeta, TypeMeta } from "../work-items/types";

/**
 * Everything the filter builder needs to show names for ids. A project view
 * passes its ProjectMeta; a workspace view passes the union across projects.
 */
export interface FilterSource {
  states: Array<StateMeta & { projectName?: string }>;
  labels: LabelMeta[];
  types: TypeMeta[];
  members: MemberMeta[];
  projects?: Array<{ id: string; name: string; identifier: string; color: string | null }>;
  me: string;
}

/** Fields in the "Add filter" menu, in display order. */
export function filterFields(source: FilterSource): FilterField[] {
  return [
    "state",
    "stateGroup",
    "priority",
    "assignee",
    "label",
    "type",
    "dueDate",
    "startDate",
    ...(source.projects ? (["project"] as const) : []),
    "createdBy",
    "subscriber",
    "parent",
    "estimate",
    "title",
    "createdAt",
    "updatedAt",
    "completedAt",
    "hasSubItems",
    "isBlocked",
    "origin",
  ];
}
