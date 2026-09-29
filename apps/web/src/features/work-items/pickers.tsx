"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { format, isBefore, parseISO, startOfToday } from "date-fns";
import { CalendarDays, Check, CircleUserRound, Tag as TagIcon, Shapes } from "lucide-react";
import type { Priority } from "@dopl/shared/schemas/work-item";
import { priorities } from "@dopl/shared/schemas/work-item";
import { cn } from "@/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip } from "@/components/ui/tooltip";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Tag, TagDot, Overflow } from "@/components/ui/tag";
import { StateIcon } from "@/components/icons/state-icon";
import { PriorityIcon } from "@/components/icons/priority-icon";
import { TypeIcon } from "./type-icon";
import type { ProjectMeta } from "./types";

export type TriggerVariant = "icon" | "pill" | "field";

export interface PickerOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  keywords?: string[];
}

/** Popover + searchable list; single or multi select. */
export function Picker({
  options,
  selected,
  onChange,
  multi = false,
  placeholder,
  trigger,
  open,
  onOpenChange,
  align = "start",
  disabled,
}: {
  options: PickerOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  multi?: boolean;
  placeholder: string;
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  disabled?: boolean;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const t = useTranslations("items");
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-64 p-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Command loop>
          <CommandInput placeholder={placeholder} autoFocus />
          <CommandList>
            <CommandEmpty>{t("noValue")}</CommandEmpty>
            {options.map((o) => {
              const isSel = selected.includes(o.value);
              return (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  keywords={o.keywords}
                  onSelect={() => {
                    if (multi)
                      onChange(
                        isSel ? selected.filter((v) => v !== o.value) : [...selected, o.value],
                      );
                    else {
                      onChange([o.value]);
                      setOpen(false);
                    }
                  }}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {isSel ? <Check className="text-sky-600" /> : null}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const triggerBase =
  "inline-flex shrink-0 items-center gap-1.5 rounded-[7px] text-small text-fg-secondary transition-colors duration-[var(--dur-fast)] focus-ring disabled:pointer-events-none";
const triggerClasses: Record<TriggerVariant, string> = {
  icon: cn(triggerBase, "size-6 justify-center hover:bg-neutral-150"),
  pill: cn(triggerBase, "h-6 border border-border bg-surface px-1.5 hover:bg-surface-hover"),
  field: cn(triggerBase, "h-8 w-full justify-start px-2 text-body text-fg hover:bg-neutral-150"),
};

/* ───────── State ───────── */
export function StatePicker({
  meta,
  value,
  onChange,
  variant = "icon",
  open,
  onOpenChange,
  disabled,
}: {
  meta: ProjectMeta;
  value: string;
  onChange: (stateId: string) => void;
  variant?: TriggerVariant;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("items");
  const state = meta.states.find((s) => s.id === value);
  return (
    <Picker
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      placeholder={t("changeState")}
      selected={[value]}
      onChange={([v]) => v && v !== value && onChange(v)}
      options={meta.states.map((s) => ({
        value: s.id,
        label: s.name,
        icon: <StateIcon group={s.group} color={s.color} />,
      }))}
      trigger={
        <button
          type="button"
          className={triggerClasses[variant]}
          aria-label={`${t("prop.state")}: ${state?.name ?? ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {state ? <StateIcon group={state.group} color={state.color} /> : null}
          {variant !== "icon" ? <span className="truncate">{state?.name}</span> : null}
        </button>
      }
    />
  );
}

/* ───────── Priority ───────── */
export function PriorityPicker({
  value,
  onChange,
  variant = "icon",
  open,
  onOpenChange,
  disabled,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  variant?: TriggerVariant;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("items");
  return (
    <Picker
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      placeholder={t("changePriority")}
      selected={[value]}
      onChange={([v]) => v && v !== value && onChange(v as Priority)}
      options={priorities.map((p) => ({
        value: p,
        label: t(`priority.${p}`),
        icon: <PriorityIcon priority={p} />,
      }))}
      trigger={
        <button
          type="button"
          className={triggerClasses[variant]}
          aria-label={`${t("prop.priority")}: ${t(`priority.${value}`)}`}
          onClick={(e) => e.stopPropagation()}
        >
          <PriorityIcon priority={value} />
          {variant !== "icon" ? <span className="truncate">{t(`priority.${value}`)}</span> : null}
        </button>
      }
    />
  );
}

/* ───────── Assignees ───────── */
export function AssigneePicker({
  meta,
  value,
  onChange,
  variant = "icon",
  open,
  onOpenChange,
  disabled,
}: {
  meta: ProjectMeta;
  value: string[];
  onChange: (ids: string[]) => void;
  variant?: TriggerVariant;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("items");
  const users = value
    .map((id) => meta.members.find((m) => m.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  const options = [...meta.members].sort((a, b) =>
    a.id === meta.me ? -1 : b.id === meta.me ? 1 : 0,
  );
  return (
    <Picker
      multi
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      placeholder={t("assign")}
      selected={value}
      onChange={onChange}
      options={options.map((u) => ({
        value: u.id,
        label: u.name,
        keywords: [u.email],
        icon: <Avatar user={u} size="xs" />,
      }))}
      trigger={
        <button
          type="button"
          className={cn(triggerClasses[variant], variant === "icon" && "w-auto min-w-6 px-0.5")}
          aria-label={t("prop.assignees")}
          onClick={(e) => e.stopPropagation()}
        >
          {users.length ? (
            <AvatarStack users={users} size="sm" max={3} />
          ) : (
            <CircleUserRound
              className={cn(
                "size-[18px] text-fg-placeholder",
                variant === "icon" && "reveal-on-row-hover",
              )}
            />
          )}
          {variant === "field" ? (
            <span className="truncate">
              {users.length ? users.map((u) => u.name).join(", ") : t("noAssignee")}
            </span>
          ) : null}
        </button>
      }
    />
  );
}

/* ───────── Labels ───────── */
export function LabelPicker({
  meta,
  value,
  onChange,
  variant = "pill",
  open,
  onOpenChange,
  disabled,
  max = 2,
}: {
  meta: ProjectMeta;
  value: string[];
  onChange: (ids: string[]) => void;
  variant?: TriggerVariant;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  disabled?: boolean;
  max?: number;
}) {
  const t = useTranslations("items");
  const labels = value
    .map((id) => meta.labels.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  return (
    <Picker
      multi
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      placeholder={t("addLabels")}
      selected={value}
      onChange={onChange}
      options={meta.labels.map((l) => ({
        value: l.id,
        label: l.name,
        icon: <TagDot color={l.color} className="mx-1" />,
      }))}
      trigger={
        <button
          type="button"
          className={cn(
            "inline-flex min-w-0 items-center gap-1 rounded-[7px] focus-ring",
            variant === "field" && "h-auto min-h-8 w-full flex-wrap px-2 py-1 hover:bg-neutral-150",
          )}
          aria-label={t("prop.labels")}
          onClick={(e) => e.stopPropagation()}
        >
          {labels.length === 0 ? (
            variant === "field" ? (
              <span className="text-body text-fg-muted">{t("noLabel")}</span>
            ) : (
              <span className={cn(triggerClasses.icon, "reveal-on-row-hover")}>
                <TagIcon className="size-3.5 text-fg-placeholder" />
              </span>
            )
          ) : (
            <>
              {labels.slice(0, variant === "field" ? 99 : max).map((l) => (
                <Tag key={l.id} color={l.color}>
                  {l.name}
                </Tag>
              ))}
              {variant !== "field" ? <Overflow count={labels.length - max} /> : null}
            </>
          )}
        </button>
      }
    />
  );
}

/* ───────── Type ───────── */
export function TypePicker({
  meta,
  value,
  onChange,
  variant = "icon",
  disabled,
}: {
  meta: ProjectMeta;
  value: string | null;
  onChange: (id: string | null) => void;
  variant?: TriggerVariant;
  disabled?: boolean;
}) {
  const t = useTranslations("items");
  const type = meta.types.find((x) => x.id === value);
  return (
    <Picker
      disabled={disabled}
      placeholder={t("setType")}
      selected={value ? [value] : []}
      onChange={([v]) => onChange(v ?? null)}
      options={meta.types.map((ty) => ({
        value: ty.id,
        label: ty.name,
        icon: <TypeIcon icon={ty.icon} color={ty.color} />,
      }))}
      trigger={
        <button
          type="button"
          className={triggerClasses[variant]}
          aria-label={t("prop.type")}
          onClick={(e) => e.stopPropagation()}
        >
          {type ? (
            <TypeIcon icon={type.icon} color={type.color} />
          ) : (
            <Shapes className="size-4 text-fg-placeholder" />
          )}
          {variant !== "icon" ? (
            <span className="truncate">{type?.name ?? t("noType")}</span>
          ) : null}
        </button>
      }
    />
  );
}

/* ───────── Dates ───────── */
export function DatePicker({
  value,
  onChange,
  variant = "pill",
  label,
  open,
  onOpenChange,
  disabled,
  highlightOverdue = true,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  variant?: TriggerVariant;
  label: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  disabled?: boolean;
  highlightOverdue?: boolean;
}) {
  const tc = useTranslations("common.calendar");
  const t = useTranslations("items");
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const overdue = highlightOverdue && value ? isBefore(parseISO(value), startOfToday()) : false;
  if (!value && variant === "pill") variant = "icon";
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={label}
          className={cn(
            triggerClasses[variant],
            "tabular",
            !value && variant === "icon" && "reveal-on-row-hover",
            overdue && "border-danger-border text-danger-text [&_svg]:text-danger-text",
          )}
        >
          <CalendarDays className={cn("size-3.5", !value && "text-fg-placeholder")} />
          {value ? (
            <span>{format(parseISO(value), variant === "field" ? "d MMM yyyy" : "d MMM")}</span>
          ) : variant === "field" ? (
            <span className="text-fg-muted">{t("noDate")}</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0" onClick={(e) => e.stopPropagation()}>
        <Calendar
          value={value}
          onChange={(v) => {
            onChange(v);
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
      </PopoverContent>
    </Popover>
  );
}

export { Tooltip };
