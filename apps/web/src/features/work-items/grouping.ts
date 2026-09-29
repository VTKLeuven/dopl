import type { DisplayOptions, GroupKey } from "@dopl/shared/schemas/view";
import { priorities, type Priority, type StateGroup } from "@dopl/shared/schemas/work-item";
import type { ProjectMeta, WorkItemRow } from "./types";

export interface ItemGroup {
  key: string; // e.g. state:<id>, priority:HIGH, assignee:<id>|none
  field: GroupKey;
  value: string | null;
  label: string;
  rows: WorkItemRow[];
  /** Visual hints for the header */
  state?: { group: StateGroup; color: string };
  priority?: Priority;
  color?: string;
  userId?: string;
  typeIcon?: { icon: string; color: string };
  /** Done groups start collapsed when done items are hidden (D-053). */
  done?: boolean;
}

const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

export function sortRows(rows: WorkItemRow[], order: DisplayOptions["orderBy"]): WorkItemRow[] {
  const dir = order.dir === "desc" ? -1 : 1;
  const byKey = (a: WorkItemRow, b: WorkItemRow) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
  const cmpNullable = (a: string | null, b: string | null) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -dir : dir;
  const sorted = [...rows];
  switch (order.field) {
    case "manual":
      return sorted.sort(byKey);
    case "priority":
      return sorted.sort(
        (a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) * dir || byKey(a, b),
      );
    case "dueDate":
      return sorted.sort((a, b) => cmpNullable(a.dueDate, b.dueDate) || byKey(a, b));
    case "startDate":
      return sorted.sort((a, b) => cmpNullable(a.startDate, b.startDate) || byKey(a, b));
    case "createdAt":
    case "updatedAt": {
      const f = order.field;
      return sorted.sort((a, b) => (a[f] < b[f] ? -dir : a[f] > b[f] ? dir : 0));
    }
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title) * dir);
    case "sequence":
      return sorted.sort((a, b) => ((a.sequence ?? 0) - (b.sequence ?? 0)) * dir);
  }
}

export function groupRows(
  rows: WorkItemRow[],
  opts: DisplayOptions,
  meta: ProjectMeta,
  labels: { none: Record<GroupKey, string>; priority: (p: Priority) => string },
): ItemGroup[] {
  const visible = opts.showSubItems ? rows : rows.filter((r) => !r.parentId);
  const sorted = sortRows(visible, opts.orderBy);
  const field = opts.groupBy;
  const make = (partial: Omit<ItemGroup, "rows" | "field">): ItemGroup => ({
    ...partial,
    field,
    rows: [],
  });
  let groups: ItemGroup[];

  switch (field) {
    case "state":
      groups = meta.states.map((s) =>
        make({
          key: `state:${s.id}`,
          value: s.id,
          label: s.name,
          state: { group: s.group, color: s.color },
          done: s.group === "COMPLETED" || s.group === "CANCELLED",
        }),
      );
      for (const r of sorted) groups.find((g) => g.value === r.stateId)?.rows.push(r);
      break;
    case "priority":
      groups = priorities.map((p) =>
        make({ key: `priority:${p}`, value: p, label: labels.priority(p), priority: p }),
      );
      for (const r of sorted) groups.find((g) => g.value === r.priority)?.rows.push(r);
      break;
    case "assignee": {
      groups = [
        ...meta.members.map((u) =>
          make({ key: `assignee:${u.id}`, value: u.id, label: u.name, userId: u.id }),
        ),
        make({ key: "assignee:none", value: null, label: labels.none.assignee }),
      ];
      for (const r of sorted) {
        if (r.assigneeIds.length === 0) groups.at(-1)?.rows.push(r);
        for (const id of r.assigneeIds) groups.find((g) => g.value === id)?.rows.push(r);
      }
      break;
    }
    case "label": {
      groups = [
        ...meta.labels.map((l) =>
          make({ key: `label:${l.id}`, value: l.id, label: l.name, color: l.color }),
        ),
        make({ key: "label:none", value: null, label: labels.none.label }),
      ];
      for (const r of sorted) {
        if (r.labelIds.length === 0) groups.at(-1)?.rows.push(r);
        for (const id of r.labelIds) groups.find((g) => g.value === id)?.rows.push(r);
      }
      break;
    }
    case "type": {
      groups = [
        ...meta.types.map((t) =>
          make({
            key: `type:${t.id}`,
            value: t.id,
            label: t.name,
            typeIcon: { icon: t.icon, color: t.color },
          }),
        ),
        make({ key: "type:none", value: null, label: labels.none.type }),
      ];
      for (const r of sorted)
        (groups.find((g) => g.value === r.typeId) ?? groups.at(-1))?.rows.push(r);
      break;
    }
    case "none":
    default:
      groups = [{ key: "all", field: "none", value: null, label: "", rows: sorted }];
  }

  if (!opts.showEmptyGroups)
    groups = groups.filter((g) => g.rows.length > 0 || (g.done && opts.completed === "hide"));
  // Always drop empty "none" buckets for many-to-many groupings.
  return groups.filter((g) => !(g.value === null && field !== "none" && g.rows.length === 0));
}

/** The patch that moves an item into a group (drag across columns / swimlanes). */
export function patchForGroup(
  row: WorkItemRow,
  from: ItemGroup,
  to: ItemGroup,
): Record<string, unknown> | null {
  if (from.key === to.key) return null;
  switch (to.field) {
    case "state":
      return to.value ? { stateId: to.value } : null;
    case "priority":
      return { priority: to.value };
    case "type":
      return { typeId: to.value };
    case "assignee": {
      const without = row.assigneeIds.filter((id) => id !== from.value);
      return { assigneeIds: to.value ? Array.from(new Set([...without, to.value])) : [] };
    }
    case "label": {
      const without = row.labelIds.filter((id) => id !== from.value);
      return { labelIds: to.value ? Array.from(new Set([...without, to.value])) : [] };
    }
    default:
      return null;
  }
}

/** Defaults for a new item created from a group's "+" button. */
export function defaultsForGroup(group: ItemGroup | undefined): Record<string, unknown> {
  if (!group || group.value === null) return {};
  switch (group.field) {
    case "state":
      return { stateId: group.value };
    case "priority":
      return { priority: group.value };
    case "assignee":
      return { assigneeIds: [group.value] };
    case "label":
      return { labelIds: [group.value] };
    case "type":
      return { typeId: group.value };
    default:
      return {};
  }
}
