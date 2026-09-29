"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ListFilter, Plus, Trash2, X } from "lucide-react";
import {
  DATE_TOKENS,
  FILTER_FIELDS,
  ME,
  OriginSchema,
  countRules,
  hasQuickFilter,
  isGroup,
  normalizeFilter,
  operatorsFor,
  toggleQuickFilter,
  validateRule,
  type DateValue,
  type FilterField,
  type FilterGroup,
  type FilterOperator,
  type FilterRule,
  type QuickFilter,
  type Relative,
} from "@dopl/shared/schemas/filters";
import { priorities } from "@dopl/shared/schemas/work-item";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Avatar } from "@/components/ui/avatar";
import { TagDot } from "@/components/ui/tag";
import { StateIcon } from "@/components/icons/state-icon";
import { PriorityIcon } from "@/components/icons/priority-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Picker, type PickerOption } from "../work-items/pickers";
import { TypeIcon } from "../work-items/type-icon";
import { dateValueLabel, operatorLabel, valueSummary, type FiltersT } from "./describe";
import { filterFields, type FilterSource } from "./source";

const MAX_DEPTH = 3;
const QUICK: QuickFilter[] = ["mine", "dueThisWeek", "overdue", "unassigned", "urgent"];
const STATE_GROUPS = ["BACKLOG", "UNSTARTED", "STARTED", "COMPLETED", "CANCELLED"] as const;
const ORIGINS = OriginSchema.options;

let seq = 0;
const newId = () => `f${(seq++).toString(36)}`;

function withIds(group: FilterGroup): FilterGroup {
  return {
    ...group,
    id: group.id ?? newId(),
    items: group.items.map((i) => (isGroup(i) ? withIds(i) : { ...i, id: i.id ?? newId() })),
  };
}

/** Drops incomplete rules and empty groups; what's left is what gets applied. */
export function cleanFilter(group: FilterGroup): FilterGroup {
  const items = group.items
    .map((i) => (isGroup(i) ? cleanFilter(i) : i))
    .filter((i) => (isGroup(i) ? i.items.length > 0 : validateRule(i) === null));
  return normalizeFilter({ op: group.op, items });
}

/** UI-offered operators: parent can only be checked for emptiness here. */
function uiOperators(field: FilterField): FilterOperator[] {
  if (field === "parent") return ["isEmpty", "isNotEmpty"];
  return operatorsFor(field);
}

function defaultValue(field: FilterField, op: FilterOperator): unknown {
  const { kind } = FILTER_FIELDS[field];
  switch (op) {
    case "is":
      if (kind === "boolean") return true;
      if (kind === "number") return undefined;
      return "today";
    case "before":
    case "after":
      return "today";
    case "between":
      return ["startOfWeek", "endOfWeek"];
    case "withinLast":
    case "withinNext":
      return { amount: 7, unit: "day" };
    default:
      return undefined;
  }
}

/* ───────────────────────── Filter button + popover ───────────────────────── */

export function FilterButton({
  value,
  onChange,
  source,
  className,
}: {
  value: FilterGroup;
  onChange: (next: FilterGroup) => void;
  source: FilterSource;
  className?: string;
}) {
  const t = useTranslations("filters");
  const count = countRules(value);
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip active={count > 0} className={className} data-testid="filter-button">
          <ListFilter />
          {t("button")}
          {count > 0 ? (
            <span className="rounded-full bg-sky-100 px-1.5 text-caption font-medium text-sky-800 tabular">
              {count}
            </span>
          ) : null}
        </Chip>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[600px] max-w-[calc(100vw-32px)] p-0"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <FilterEditor value={value} onChange={onChange} source={source} />
      </PopoverContent>
    </Popover>
  );
}

export function FilterEditor({
  value,
  onChange,
  source,
}: {
  value: FilterGroup;
  onChange: (next: FilterGroup) => void;
  source: FilterSource;
}) {
  const t = useTranslations("filters");
  // The popover remounts on open, so the draft starts from the applied filter.
  const [draft, setDraft] = useState<FilterGroup>(() => withIds(value));
  const commit = (next: FilterGroup) => {
    setDraft(next);
    onChange(cleanFilter(next));
  };
  const applied = cleanFilter(draft);
  return (
    <div className="flex max-h-[min(640px,80vh)] flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2.5">
        <span className="mr-1 text-small font-medium text-fg-muted">{t("quick")}</span>
        {QUICK.map((q) => {
          const on = hasQuickFilter(applied, q);
          return (
            <button
              key={q}
              type="button"
              aria-pressed={on}
              onClick={() => commit(withIds(toggleQuickFilter(applied, q)))}
              className={cn(
                "h-7 rounded-chip border px-2 text-small focus-ring transition-colors",
                on
                  ? "border-sky-200 bg-sky-50 text-sky-800"
                  : "border-border text-fg-secondary hover:bg-surface-hover",
              )}
            >
              {t(`quickFilter.${q}`)}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 overflow-y-auto p-3">
        <GroupEditor group={draft} onChange={commit} source={source} depth={1} />
      </div>
      {countRules(draft) > 0 ? (
        <div className="flex items-center justify-end border-t border-border px-3 py-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => commit(withIds({ op: "and", items: [] }))}
          >
            {t("clearAll")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Groups ───────────────────────── */

function GroupEditor({
  group,
  onChange,
  onRemove,
  source,
  depth,
}: {
  group: FilterGroup;
  onChange: (g: FilterGroup) => void;
  onRemove?: () => void;
  source: FilterSource;
  depth: number;
}) {
  const t = useTranslations("filters");
  const [autoOpen, setAutoOpen] = useState<string | null>(null);
  const setItem = (id: string | undefined, next: FilterGroup | FilterRule | null) =>
    onChange({
      ...group,
      items: next
        ? group.items.map((i) => (i.id === id ? next : i))
        : group.items.filter((i) => i.id !== id),
    });
  const addRule = (field: FilterField) => {
    const op = uiOperators(field)[0] as FilterOperator;
    const rule: FilterRule = { id: newId(), field, operator: op, value: defaultValue(field, op) };
    setAutoOpen(rule.id ?? null);
    onChange({ ...group, items: [...group.items, rule] });
  };
  const addGroup = () =>
    onChange({
      ...group,
      items: [...group.items, { id: newId(), op: group.op === "and" ? "or" : "and", items: [] }],
    });

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        depth > 1 && "rounded-control border border-border bg-canvas/60 p-2",
      )}
    >
      {group.items.length === 0 && depth === 1 ? (
        <p className="px-1 py-2 text-body text-fg-muted">{t("empty")}</p>
      ) : null}
      {group.items.map((item, index) => (
        <div key={item.id} className="flex items-start gap-2">
          <div className="flex h-8 w-16 shrink-0 items-center justify-end">
            {index === 0 ? (
              <span className="text-small text-fg-muted">{t("where")}</span>
            ) : index === 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-0.5 rounded-chip px-1.5 text-small font-medium text-fg-secondary focus-ring hover:bg-neutral-150"
                    data-testid="group-op"
                  >
                    {t(group.op)}
                    <ChevronDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={group.op}
                    onValueChange={(op) => onChange({ ...group, op: op as "and" | "or" })}
                  >
                    <DropdownMenuRadioItem value="and">{t("andHint")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="or">{t("orHint")}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="text-small text-fg-muted">{t(group.op)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {isGroup(item) ? (
              <GroupEditor
                group={item}
                onChange={(g) => setItem(item.id, g)}
                onRemove={() => setItem(item.id, null)}
                source={source}
                depth={depth + 1}
              />
            ) : (
              <RuleRow
                rule={item}
                source={source}
                autoOpen={autoOpen === item.id}
                onChange={(r) => setItem(item.id, r)}
                onRemove={() => setItem(item.id, null)}
              />
            )}
          </div>
        </div>
      ))}
      <div className={cn("flex items-center gap-1", group.items.length > 0 && "pl-[72px]")}>
        <AddFilterMenu source={source} onPick={addRule} />
        {depth < MAX_DEPTH ? (
          <Button variant="ghost" size="xs" onClick={addGroup}>
            <Plus />
            {t("addGroup")}
          </Button>
        ) : null}
        {onRemove ? (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-fg-muted"
            onClick={onRemove}
            aria-label={t("removeGroup")}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AddFilterMenu({
  source,
  onPick,
}: {
  source: FilterSource;
  onPick: (f: FilterField) => void;
}) {
  const t = useTranslations("filters");
  const fields = filterFields(source);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" data-testid="add-filter">
          <Plus />
          {t("addFilter")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 overflow-y-auto"
        // Focus goes to the new rule's value picker, not back to this button.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {fields.map((f, i) => (
          <div key={f}>
            {i === 8 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={() => onPick(f)}>{t(`field.${f}`)}</DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ───────────────────────── Rules ───────────────────────── */

function RuleRow({
  rule,
  source,
  autoOpen,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  source: FilterSource;
  autoOpen: boolean;
  onChange: (r: FilterRule) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("filters") as unknown as FiltersT;
  const incomplete = validateRule(rule) !== null;
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1.5" data-testid="filter-rule">
      <span className="inline-flex h-7 items-center rounded-chip bg-neutral-100 px-2 text-small font-medium text-fg">
        {t(`field.${rule.field}`)}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-0.5 rounded-chip px-1.5 text-small text-fg-secondary focus-ring hover:bg-neutral-150"
          >
            {operatorLabel(t, rule.field, rule.operator)}
            <ChevronDown className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={rule.operator}
            onValueChange={(op) => {
              const operator = op as FilterOperator;
              const keep =
                (["in", "notIn"].includes(operator) && ["in", "notIn"].includes(rule.operator)) ||
                (["is", "before", "after"].includes(operator) &&
                  ["is", "before", "after"].includes(rule.operator) &&
                  typeof rule.value === "string");
              onChange({
                ...rule,
                operator,
                value: keep ? rule.value : defaultValue(rule.field, operator),
              });
            }}
          >
            {uiOperators(rule.field).map((op) => (
              <DropdownMenuRadioItem key={op} value={op}>
                {operatorLabel(t, rule.field, op)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <ValueEditor rule={rule} source={source} autoOpen={autoOpen} onChange={onChange} />
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("remove")}
        className={cn(
          "ml-auto inline-flex size-7 items-center justify-center rounded-chip text-icon focus-ring hover:bg-neutral-150 hover:text-fg",
        )}
      >
        <X className="size-3.5" />
      </button>
      {incomplete ? <span className="sr-only">{t("incomplete")}</span> : null}
    </div>
  );
}

const valueTrigger =
  "inline-flex h-7 max-w-64 min-w-0 items-center gap-1.5 rounded-chip border border-border bg-surface px-2 text-small text-fg focus-ring hover:bg-surface-hover";

function ValueEditor({
  rule,
  source,
  autoOpen,
  onChange,
}: {
  rule: FilterRule;
  source: FilterSource;
  autoOpen: boolean;
  onChange: (r: FilterRule) => void;
}) {
  const t = useTranslations("filters") as unknown as FiltersT;
  const tItems = useTranslations("items") as unknown as FiltersT;
  const { kind } = FILTER_FIELDS[rule.field];
  const set = (value: unknown) => onChange({ ...rule, value });

  switch (rule.operator) {
    case "isEmpty":
    case "isNotEmpty":
      return null;
    case "in":
    case "notIn": {
      const selected = (rule.value as string[] | undefined) ?? [];
      return (
        <OptionsValue
          field={rule.field}
          selected={selected}
          onChange={(v) => set(v.length ? v : undefined)}
          source={source}
          autoOpen={autoOpen}
          summary={
            selected.length ? valueSummary(t, tItems, { ...rule, value: selected }, source) : null
          }
        />
      );
    }
    case "is":
      if (kind === "boolean")
        return (
          <SegmentedControl
            value={rule.value === false ? "no" : "yes"}
            onValueChange={(v) => set(v === "yes")}
            label={t(`field.${rule.field}`)}
            className="h-7"
          >
            <SegmentedControlItem value="yes">{t("yes")}</SegmentedControlItem>
            <SegmentedControlItem value="no">{t("no")}</SegmentedControlItem>
          </SegmentedControl>
        );
      if (kind === "number") return <NumberValue value={rule.value} onChange={set} />;
      return <DateValuePicker value={rule.value as DateValue} onChange={set} />;
    case "before":
    case "after":
      return <DateValuePicker value={rule.value as DateValue} onChange={set} />;
    case "between": {
      const [a, b] = (rule.value as [DateValue, DateValue] | undefined) ?? [
        "startOfWeek",
        "endOfWeek",
      ];
      return (
        <span className="inline-flex items-center gap-1">
          <DateValuePicker value={a} onChange={(v) => set([v, b])} />
          <span className="text-small text-fg-muted">{t("and")}</span>
          <DateValuePicker value={b} onChange={(v) => set([a, v])} />
        </span>
      );
    }
    case "withinLast":
    case "withinNext":
      return <RelativeValue value={rule.value as Relative} onChange={set} />;
    case "lt":
    case "gt":
      return <NumberValue value={rule.value} onChange={set} />;
    case "contains":
      return (
        <TextValue
          value={(rule.value as string | undefined) ?? ""}
          onChange={set}
          autoOpen={autoOpen}
        />
      );
  }
}

function OptionsValue({
  field,
  selected,
  onChange,
  source,
  autoOpen,
  summary,
}: {
  field: FilterField;
  selected: string[];
  onChange: (v: string[]) => void;
  source: FilterSource;
  autoOpen: boolean;
  summary: string | null;
}) {
  const t = useTranslations("filters");
  const tItems = useTranslations("items");
  const [open, setOpen] = useState(autoOpen);
  const options: PickerOption[] = (() => {
    switch (field) {
      case "state":
        return source.states.map((s) => ({
          value: s.id,
          label: s.projectName ? `${s.name} · ${s.projectName}` : s.name,
          icon: <StateIcon group={s.group} color={s.color} />,
        }));
      case "stateGroup":
        return STATE_GROUPS.map((g) => ({
          value: g,
          label: t(`stateGroup.${g}`),
          icon: <StateIcon group={g} />,
        }));
      case "priority":
        return priorities.map((p) => ({
          value: p,
          label: tItems(`priority.${p}`),
          icon: <PriorityIcon priority={p} />,
        }));
      case "type":
        return source.types.map((ty) => ({
          value: ty.id,
          label: ty.name,
          icon: <TypeIcon icon={ty.icon} color={ty.color} />,
        }));
      case "label":
        return source.labels.map((l) => ({
          value: l.id,
          label: l.name,
          icon: <TagDot color={l.color} className="mx-1" />,
        }));
      case "project":
        return (source.projects ?? []).map((p) => ({
          value: p.id,
          label: p.name,
          keywords: [p.identifier],
        }));
      case "origin":
        return ORIGINS.map((o) => ({ value: o, label: t(`origin.${o}`) }));
      case "assignee":
      case "subscriber":
      case "createdBy": {
        const me = source.members.find((m) => m.id === source.me);
        return [
          {
            value: ME,
            label: t("me"),
            icon: me ? <Avatar user={me} size="xs" /> : undefined,
          },
          ...source.members
            .filter((m) => m.id !== source.me)
            .map((m) => ({
              value: m.id,
              label: m.name,
              keywords: [m.email],
              icon: <Avatar user={m} size="xs" />,
            })),
        ];
      }
      default:
        return [];
    }
  })();
  return (
    <Picker
      multi
      open={open}
      onOpenChange={setOpen}
      placeholder={t("search")}
      selected={selected}
      onChange={onChange}
      options={options}
      trigger={
        <button type="button" className={valueTrigger} data-testid="filter-value">
          <span className={cn("truncate", !summary && "text-fg-muted")}>
            {summary ?? t("choose")}
          </span>
          <ChevronDown className="size-3 shrink-0 text-icon" />
        </button>
      }
    />
  );
}

function DateValuePicker({
  value,
  onChange,
}: {
  value: DateValue;
  onChange: (v: DateValue) => void;
}) {
  const t = useTranslations("filters") as unknown as FiltersT;
  const tc = useTranslations("common.calendar");
  const [open, setOpen] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setCalendar(false);
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={valueTrigger}>
          <span className="truncate">{dateValueLabel(t, value)}</span>
          <ChevronDown className="size-3 shrink-0 text-icon" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1" onKeyDown={(e) => e.stopPropagation()}>
        {calendar ? (
          <Calendar
            value={isDate ? value : null}
            onChange={(v) => {
              if (v) onChange(v);
              setOpen(false);
            }}
            labels={{
              prev: tc("prev"),
              next: tc("next"),
              today: tc("today"),
              tomorrow: tc("tomorrow"),
              nextWeek: tc("nextWeek"),
              clear: tc("clear"),
            }}
          />
        ) : (
          <div className="flex w-48 flex-col">
            {DATE_TOKENS.map((tok) => (
              <button
                key={tok}
                type="button"
                onClick={() => {
                  onChange(tok);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-8 items-center rounded-[8px] px-2 text-left text-body focus-ring hover:bg-neutral-150",
                  value === tok && "font-medium text-sky-800",
                )}
              >
                {t(`token.${tok}`)}
              </button>
            ))}
            <div className="-mx-1 my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => setCalendar(true)}
              className="flex h-8 items-center rounded-[8px] px-2 text-left text-body focus-ring hover:bg-neutral-150"
            >
              {isDate ? dateValueLabel(t, value) : t("pickDate")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RelativeValue({
  value,
  onChange,
}: {
  value: Relative | undefined;
  onChange: (v: Relative) => void;
}) {
  const t = useTranslations("filters") as unknown as FiltersT;
  const v = value ?? { amount: 7, unit: "day" as const };
  const [amount, setAmount] = useState(String(v.amount));
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        type="number"
        min={1}
        max={365}
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 1 && n <= 365) onChange({ ...v, amount: n });
        }}
        className="h-7 w-16 px-2 text-small"
        aria-label={t("amount")}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={valueTrigger}>
            {t(`unitName.${v.unit}`)}
            <ChevronDown className="size-3 shrink-0 text-icon" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={v.unit}
            onValueChange={(unit) => onChange({ ...v, unit: unit as Relative["unit"] })}
          >
            {(["day", "week", "month"] as const).map((u) => (
              <DropdownMenuRadioItem key={u} value={u}>
                {t(`unitName.${u}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

function NumberValue({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const t = useTranslations("filters");
  const [text, setText] = useState(typeof value === "number" ? String(value) : "");
  return (
    <Input
      type="number"
      step="any"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.value === "" ? NaN : Number(e.target.value);
        onChange(Number.isFinite(n) ? n : undefined);
      }}
      className="h-7 w-20 px-2 text-small"
      aria-label={t("amount")}
    />
  );
}

/** Commits after a short pause so typing doesn't refetch on every key. */
function TextValue({
  value,
  onChange,
  autoOpen,
}: {
  value: string;
  onChange: (v: string) => void;
  autoOpen: boolean;
}) {
  const t = useTranslations("filters");
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Input
      autoFocus={autoOpen}
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(next), 300);
      }}
      placeholder={t("textPlaceholder")}
      className="h-7 w-48 px-2 text-small"
      aria-label={t("field.title")}
    />
  );
}
