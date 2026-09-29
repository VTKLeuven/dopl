"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { isEmptyChart } from "@dopl/shared/domain/analytics";
import {
  METRIC_DEFS,
  METRICS,
  type CategoryAxis,
  type ChartType,
  type Metric,
  type Range,
  type WidgetSpec,
  type WidgetWidth,
  type XAxis,
} from "@dopl/shared/schemas/analytics";
import { EMPTY_FILTER } from "@dopl/shared/schemas/filters";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { FilterButton } from "@/features/filters/filter-builder";
import { useScopeMeta } from "@/features/work-items/data";
import { ChartView } from "./chart";
import { useMetric, useWidgetMutations } from "./data";
import { WidgetSkeleton } from "./widget-card";

export interface BuilderTarget {
  dashboardId: string;
  /** Editing an existing widget; absent for a new one. */
  widget?: { id: string; title: string; spec: WidgetSpec; w: WidgetWidth };
}

const NEW_SPEC: WidgetSpec = {
  metric: "created",
  xAxis: "week",
  segment: null,
  chartType: "BAR",
  filters: EMPTY_FILTER,
};

/** Keeps what still fits after the metric changes; falls back to the metric's defaults. */
function withMetric(spec: WidgetSpec, metric: Metric): WidgetSpec {
  const def = METRIC_DEFS[metric];
  const xAxis = def.xAxes.includes(spec.xAxis) ? spec.xAxis : def.defaultX;
  const segment =
    spec.segment && def.segments.includes(spec.segment) && spec.segment !== xAxis
      ? spec.segment
      : null;
  const chartType = def.charts.includes(spec.chartType) ? spec.chartType : def.defaultChart;
  return { ...spec, metric, xAxis, segment, chartType };
}

/**
 * The chart builder (ROADMAP §Phase 6.4): metric × x-axis × split + filters,
 * a chart type, and a live preview with the dashboard's period and project.
 * Only combinations the registry allows can be picked.
 */
export function ChartBuilder({
  ws,
  target,
  range,
  projectId,
  onClose,
}: {
  ws: string;
  target: BuilderTarget | null;
  range: Range;
  projectId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      {target ? (
        <BuilderForm
          key={target.widget?.id ?? "new"}
          ws={ws}
          target={target}
          range={range}
          projectId={projectId}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function BuilderForm({
  ws,
  target,
  range,
  projectId,
  onClose,
}: {
  ws: string;
  target: BuilderTarget;
  range: Range;
  projectId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("analytics");
  const [spec, setSpec] = useState<WidgetSpec>(target.widget?.spec ?? NEW_SPEC);
  const [title, setTitle] = useState(target.widget?.title ?? "");
  const [titleTouched, setTitleTouched] = useState(Boolean(target.widget));
  const { save } = useWidgetMutations(ws, target.dashboardId);
  const { data: meta } = useScopeMeta(ws, { kind: "workspace" });
  const preview = useMetric(ws, { spec, range, projectId });
  const def = METRIC_DEFS[spec.metric];
  const shownTitle = titleTouched ? title : t(`metric.${spec.metric}`);
  const segments = def.segments.filter((s) => s !== spec.xAxis);
  const canSegment = segments.length > 0 && !["NUMBER", "DONUT"].includes(spec.chartType);

  const submit = () => {
    const name = shownTitle.trim();
    if (!name) return;
    save.mutate(
      {
        id: target.widget?.id,
        title: name,
        spec: { ...spec, segment: canSegment ? spec.segment : null },
        w: target.widget?.w ?? (spec.chartType === "NUMBER" ? 4 : 6),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <DialogContent size="xl" data-testid="chart-builder">
      <DialogHeader>
        <DialogTitle>{target.widget ? t("builder.editTitle") : t("builder.newTitle")}</DialogTitle>
        <DialogDescription>{t(`metricHint.${spec.metric}`)}</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Field label={t("builder.name")}>
            <Input
              value={shownTitle}
              placeholder={t("builder.namePlaceholder")}
              aria-label={t("builder.name")}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              maxLength={120}
            />
          </Field>
          <Field label={t("builder.metric")}>
            <Choice
              testId="builder-metric"
              value={spec.metric}
              options={METRICS.map((m) => ({ value: m, label: t(`metric.${m}`) }))}
              onChange={(m) => setSpec((s) => withMetric(s, m as Metric))}
            />
          </Field>
          <Field label={t("builder.xAxis")}>
            <Choice
              testId="builder-x"
              value={spec.xAxis}
              options={def.xAxes.map((x) => ({ value: x, label: t(`axis.${x}`) }))}
              onChange={(x) =>
                setSpec((s) => ({
                  ...s,
                  xAxis: x as XAxis,
                  segment: s.segment === x ? null : s.segment,
                }))
              }
            />
          </Field>
          {canSegment ? (
            <Field label={t("builder.segment")}>
              <Choice
                testId="builder-segment"
                value={spec.segment ?? "none"}
                options={[
                  { value: "none", label: t("builder.noSegment") },
                  ...segments.map((s) => ({ value: s, label: t(`axis.${s}`) })),
                ]}
                onChange={(v) =>
                  setSpec((s) => ({ ...s, segment: v === "none" ? null : (v as CategoryAxis) }))
                }
              />
            </Field>
          ) : null}
          <Field label={t("builder.chartType")}>
            <SegmentedControl
              label={t("builder.chartType")}
              value={spec.chartType}
              onValueChange={(v) => setSpec((s) => ({ ...s, chartType: v as ChartType }))}
              className="flex h-auto flex-wrap"
            >
              {def.charts.map((c) => (
                <SegmentedControlItem key={c} value={c} data-testid={`builder-chart-${c}`}>
                  {t(`chart.${c}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </Field>
          <Field label={t("builder.filters")}>
            {def.kind === "snapshot" ? (
              <p className="text-small text-fg-muted">{t("builder.filtersNotApplied")}</p>
            ) : meta ? (
              <FilterButton
                value={spec.filters}
                onChange={(filters) => setSpec((s) => ({ ...s, filters }))}
                source={meta}
                className="self-start"
              />
            ) : null}
          </Field>
        </div>
        <div className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface-muted p-4">
          <p className="text-caption font-medium text-fg-muted">{t("builder.preview")}</p>
          <div
            className="rounded-card border border-border bg-surface p-4"
            data-testid="builder-preview"
          >
            <p className="mb-3 truncate text-body font-semibold text-fg">{shownTitle}</p>
            {preview.isPending ? (
              <WidgetSkeleton number={spec.chartType === "NUMBER"} />
            ) : preview.data ? (
              spec.chartType !== "NUMBER" && isEmptyChart(preview.data) ? (
                <p className="py-16 text-center text-body text-fg-muted">{t("widget.empty")}</p>
              ) : (
                <ChartView
                  data={preview.data}
                  chartType={spec.chartType}
                  segment={canSegment ? spec.segment : null}
                />
              )
            ) : (
              <p className="py-16 text-center text-body text-fg-muted">{t("widget.error")}</p>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {t("builder.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          loading={save.isPending}
          disabled={!shownTitle.trim()}
          data-testid="builder-save"
        >
          {target.widget ? t("builder.save") : t("builder.add")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-small font-medium text-fg-secondary">{label}</span>
      {children}
    </div>
  );
}

/** A select in the house style: a secondary button with a chevron and a radio menu. */
function Choice({
  value,
  options,
  onChange,
  testId,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  testId?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="justify-between" data-testid={testId}>
          <span className="truncate">{current?.label}</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
