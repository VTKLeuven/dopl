"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3, Ellipsis, GripVertical, Pencil, RotateCcw, Table2, Trash2 } from "lucide-react";
import { isEmptyChart } from "@dopl/shared/domain/analytics";
import {
  WIDGET_WIDTHS,
  type MetricQuery,
  type Range,
  type WidgetSpec,
  type WidgetWidth,
} from "@dopl/shared/schemas/analytics";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChartView, PLOT_HEIGHT } from "./chart";
import { useMetric } from "./data";

/** Grid spans for the 12-column dashboard (full width on phones). */
export const SPAN: Record<WidgetWidth, string> = {
  4: "md:col-span-6 xl:col-span-4",
  6: "md:col-span-6",
  8: "md:col-span-12 xl:col-span-8",
  12: "md:col-span-12",
};

export interface WidgetActions {
  onEdit?: () => void;
  onResize?: (w: WidgetWidth) => void;
  onRemove?: () => void;
  /** Drag handle props from the sortable grid. */
  handle?: React.HTMLAttributes<HTMLButtonElement>;
}

/**
 * One chart on a dashboard: title, the chart (or its table), and every state
 * designed: a skeleton the chart's size while loading, an error with retry,
 * and an empty state. Changing the period keeps the old chart until the new
 * data arrives.
 */
export function WidgetCard({
  ws,
  title,
  spec,
  w,
  range,
  projectId,
  actions,
  dragging = false,
  className,
}: {
  ws: string;
  title: string;
  spec: WidgetSpec;
  w: WidgetWidth;
  range: Range;
  projectId: string | null;
  actions?: WidgetActions;
  dragging?: boolean;
  className?: string;
}) {
  const t = useTranslations("analytics");
  const [asTable, setAsTable] = useState(false);
  const query: MetricQuery = { spec, range, projectId };
  const { data, isPending, isError, refetch, isFetching } = useMetric(ws, query);
  const number = spec.chartType === "NUMBER";
  const canTable = !number && spec.chartType !== "TABLE";
  const editable = Boolean(actions?.onEdit);

  return (
    <section
      aria-label={title}
      data-testid="widget"
      data-metric={spec.metric}
      className={cn(
        "group/widget col-span-12 flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card",
        SPAN[w],
        dragging && "shadow-drag",
        className,
      )}
    >
      <header className="-mt-1 flex min-h-7 items-center gap-1.5">
        {actions?.handle ? (
          <Tooltip content={t("widget.drag")}>
            <button
              type="button"
              aria-label={t("widget.drag")}
              className="-ml-2 inline-flex size-6 cursor-grab items-center justify-center rounded-[6px] text-icon opacity-0 focus-ring transition-opacity group-hover/widget:opacity-100 hover:bg-neutral-150 focus-visible:opacity-100 active:cursor-grabbing"
              {...actions.handle}
            >
              <GripVertical className="size-4" />
            </button>
          </Tooltip>
        ) : null}
        <h3 className="min-w-0 flex-1 truncate text-body font-semibold text-fg">{title}</h3>
        {isFetching && data ? (
          <span className="size-1.5 animate-pulse rounded-full bg-sky-500" aria-hidden />
        ) : null}
        {canTable || editable ? (
          <DropdownMenu>
            <Tooltip content={t("widget.more")}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("widget.more")}
                  data-testid="widget-menu"
                  className="opacity-0 group-focus-within/widget:opacity-100 group-hover/widget:opacity-100 data-[state=open]:opacity-100"
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end">
              {editable ? (
                <DropdownMenuItem onSelect={actions?.onEdit}>
                  <Pencil />
                  {t("widget.edit")}
                </DropdownMenuItem>
              ) : null}
              {canTable ? (
                <DropdownMenuItem onSelect={() => setAsTable((v) => !v)}>
                  {asTable ? <BarChart3 /> : <Table2 />}
                  {asTable ? t("widget.asChart") : t("widget.asTable")}
                </DropdownMenuItem>
              ) : null}
              {actions?.onResize ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{t("widget.size")}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={String(w)}
                      onValueChange={(v) => actions.onResize?.(Number(v) as WidgetWidth)}
                    >
                      {WIDGET_WIDTHS.map((size) => (
                        <DropdownMenuRadioItem key={size} value={String(size)}>
                          {t(`widget.sizes.${size}`)}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null}
              {actions?.onRemove ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={actions.onRemove}>
                    <Trash2 />
                    {t("widget.remove")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      {isPending ? (
        <WidgetSkeleton number={number} />
      ) : isError && !data ? (
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-2 text-center",
            number && "min-h-24",
          )}
          style={number ? undefined : { minHeight: PLOT_HEIGHT }}
          data-testid="widget-error"
        >
          <p className="text-body text-fg-muted">{t("widget.error")}</p>
          <Button variant="secondary" size="xs" onClick={() => void refetch()}>
            <RotateCcw />
            {t("widget.retry")}
          </Button>
        </div>
      ) : data && !number && isEmptyChart(data) ? (
        <div
          className="flex flex-col items-center justify-center gap-1 text-center"
          style={{ minHeight: PLOT_HEIGHT }}
          data-testid="widget-empty"
        >
          <BarChart3 className="size-5 text-icon" aria-hidden />
          <p className="text-body font-medium text-fg-secondary">{t("widget.empty")}</p>
          <p className="text-small text-fg-muted">{t("widget.emptyHint")}</p>
        </div>
      ) : data ? (
        <ChartView
          data={data}
          chartType={spec.chartType}
          segment={spec.segment}
          asTable={asTable}
        />
      ) : null}
    </section>
  );
}

export function WidgetSkeleton({ number = false }: { number?: boolean }) {
  return number ? (
    <div className="flex min-h-24 flex-col gap-2" aria-busy>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-4 w-36" />
    </div>
  ) : (
    <Skeleton className="w-full rounded-control" style={{ height: PLOT_HEIGHT }} aria-busy />
  );
}
