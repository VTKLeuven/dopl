"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { countRules, isGroup, type FilterGroup } from "@dopl/shared/schemas/filters";
import { Button } from "@/components/ui/button";
import { operatorLabel, valueSummary, type FiltersT } from "./describe";
import type { FilterSource } from "./source";

/**
 * Applied filters as removable chips under the toolbar. Top-level rules get
 * their own chip; nested groups collapse into "Any of 2 filters".
 */
export function FilterBar({
  value,
  onChange,
  source,
  actions,
}: {
  value: FilterGroup;
  onChange: (next: FilterGroup) => void;
  source: FilterSource;
  actions?: React.ReactNode;
}) {
  const t = useTranslations("filters") as unknown as FiltersT;
  const tItems = useTranslations("items") as unknown as FiltersT;
  if (countRules(value) === 0 && !actions) return null;
  const remove = (index: number) =>
    onChange({ ...value, items: value.items.filter((_, i) => i !== index) });
  return (
    <div
      className="flex min-h-10 shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-1.5 md:px-5"
      data-testid="filter-bar"
    >
      {value.items.map((item, i) => (
        <span key={i} className="contents">
          {i > 0 ? <span className="text-caption text-fg-muted">{t(value.op)}</span> : null}
          <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-chip border border-border bg-surface pr-0.5 pl-2 text-small">
            {isGroup(item) ? (
              <span className="truncate text-fg-secondary">
                {t(item.op === "or" ? "anyOf" : "allOf", { count: countRules(item) })}
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-1">
                <span className="font-medium text-fg">{t(`field.${item.field}`)}</span>
                <span className="text-fg-muted">{operatorLabel(t, item.field, item.operator)}</span>
                <span className="truncate text-fg">{valueSummary(t, tItems, item, source)}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={t("remove")}
              className="inline-flex size-6 items-center justify-center rounded-[6px] text-icon focus-ring hover:bg-neutral-150 hover:text-fg"
            >
              <X className="size-3" />
            </button>
          </span>
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1">
        {countRules(value) > 0 ? (
          <Button variant="ghost" size="xs" onClick={() => onChange({ op: "and", items: [] })}>
            {t("clear")}
          </Button>
        ) : null}
        {actions}
      </span>
    </div>
  );
}
