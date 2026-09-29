"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { NONE_KEY, OTHER_KEY } from "@dopl/shared/domain/analytics";
import {
  isTimeAxis,
  type CategoryAxis,
  type ChartType,
  type Metric,
  type XAxis as Axis,
} from "@dopl/shared/schemas/analytics";
import { cn } from "@/lib/cn";
import { seriesColors, sliceColors } from "./colors";
import type { MetricResult } from "./types";

/** Height of the plot area including the x-axis band (never clipped). */
export const PLOT_HEIGHT = 220;

/** Which way is good for a metric's headline (colours the delta). */
const GOOD: Partial<Record<Metric, "up" | "down">> = {
  completed: "up",
  throughput: "up",
  overdue: "down",
  cycle_time: "down",
  lead_time: "down",
  time_to_triage: "down",
};

// Ticks are `caption` (12px) in muted ink (DESIGN_SYSTEM §6).
const AXIS_TICK = { fill: "var(--color-fg-muted)", fontSize: 12 };

/** Category ticks stay short; the tooltip and table carry the full name. */
const short = (s: string) => (s.length > 12 ? `${s.slice(0, 11)}…` : s);

/** Labels for x keys and series keys (entities from the server, enums from en.json). */
export function useKeyLabel(data: MetricResult, segment: CategoryAxis | null) {
  const t = useTranslations("analytics");
  return useMemo(() => {
    const enumLabel = (axis: string, key: string) => {
      const id = `keys.${axis}.${key}`;
      return t.has(id as never) ? t(id as never) : key;
    };
    const time = (key: string, axis: Axis) =>
      axis === "month" ? format(parseISO(key), "MMM yyyy") : format(parseISO(key), "d MMM");
    const generic = (key: string, axis: string | null) => {
      if (key === NONE_KEY) return t(`keys.none.${axis ?? "default"}` as never);
      if (key === OTHER_KEY) return t("keys.other");
      return data.labels[key]?.label ?? (axis ? enumLabel(axis, key) : key);
    };
    return {
      x: (key: string) =>
        key === "all"
          ? t("keys.all")
          : isTimeAxis(data.xAxis)
            ? time(key, data.xAxis)
            : generic(key, data.xAxis),
      series: (key: string) =>
        segment
          ? generic(key, segment)
          : t.has(`keys.series.${key}` as never)
            ? t(`keys.series.${key}` as never)
            : t(`metric.${data.metric}` as never),
    };
  }, [t, data, segment]);
}

export function ChartView({
  data,
  chartType,
  segment,
  asTable = false,
}: {
  data: MetricResult;
  chartType: ChartType;
  segment: CategoryAxis | null;
  asTable?: boolean;
}) {
  const label = useKeyLabel(data, segment);
  const colors = useMemo(
    () => seriesColors(data.series, segment, data.labels),
    [data.series, segment, data.labels],
  );
  if (chartType === "NUMBER") return <NumberTile data={data} />;
  if (asTable || chartType === "TABLE") return <ChartTable data={data} label={label} />;

  const rows = data.x.map((x) => ({ x, ...data.values[x] }));
  const multi = data.series.length > 1;
  const common = { data: rows, margin: { top: 8, right: 8, bottom: 0, left: -12 } };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--color-border)" />
      <XAxis
        dataKey="x"
        // Time axes thin their ticks; every category keeps its label (shortened).
        tickFormatter={isTimeAxis(data.xAxis) ? label.x : (k: string) => short(label.x(k))}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        interval={isTimeAxis(data.xAxis) ? "preserveStartEnd" : 0}
        minTickGap={isTimeAxis(data.xAxis) ? 16 : 4}
      />
      <YAxis
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        allowDecimals={data.unit === "days"}
        width={48}
      />
      <Tooltip
        cursor={{ fill: "var(--color-surface-hover)", stroke: "var(--color-border-strong)" }}
        content={(p) => (
          <ChartTooltip
            active={p.active}
            payload={p.payload}
            label={label}
            colors={colors}
            unit={data.unit}
          />
        )}
      />
    </>
  );

  let chart: React.ReactElement;
  if (chartType === "DONUT") {
    const slices = sliceColors(data.x, data.xAxis, data.labels);
    const pie = data.x.map((x) => ({ x, value: data.values[x]?.value ?? 0 }));
    chart = (
      <PieChart>
        <Pie
          data={pie}
          dataKey="value"
          nameKey="x"
          innerRadius="58%"
          outerRadius="88%"
          stroke="var(--color-surface)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {pie.map((s) => (
            <Cell key={s.x} fill={slices[s.x]} />
          ))}
        </Pie>
        <Tooltip
          content={(p) => (
            <ChartTooltip
              active={p.active}
              payload={p.payload}
              label={label}
              colors={slices}
              unit={data.unit}
              byName
            />
          )}
        />
      </PieChart>
    );
    return (
      <div className="flex flex-col gap-2">
        <Legend items={data.x.map((x) => ({ key: x, name: label.x(x), color: slices[x]! }))} />
        <div style={{ height: PLOT_HEIGHT }}>
          <ResponsiveContainer>{chart}</ResponsiveContainer>
        </div>
      </div>
    );
  }
  if (chartType === "LINE") {
    chart = (
      <LineChart {...common}>
        {axes}
        {data.series.map((s) => (
          <Line
            key={s}
            dataKey={s}
            stroke={colors[s]}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, stroke: "var(--color-surface)", strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  } else if (chartType === "AREA") {
    chart = (
      <AreaChart {...common}>
        {axes}
        {data.series.map((s) => (
          <Area
            key={s}
            dataKey={s}
            stackId={multi ? "a" : undefined}
            stroke={colors[s]}
            strokeWidth={2}
            fill={colors[s]}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--color-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    );
  } else {
    const stacked = chartType === "STACKED_BAR" && multi;
    chart = (
      <BarChart {...common} barCategoryGap="24%" barGap={2}>
        {axes}
        {data.series.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            stackId={stacked ? "a" : undefined}
            fill={colors[s]}
            maxBarSize={24}
            // Rounded data-end, square at the baseline; in a stack only the top segment.
            radius={!stacked || i === data.series.length - 1 ? [4, 4, 0, 0] : 0}
            // The 2px surface gap between stacked segments.
            stroke={stacked ? "var(--color-surface)" : undefined}
            strokeWidth={stacked ? 2 : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {multi ? (
        <Legend
          items={data.series.map((s) => ({ key: s, name: label.series(s), color: colors[s]! }))}
        />
      ) : null}
      <div style={{ height: PLOT_HEIGHT }}>
        <ResponsiveContainer>{chart}</ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ items }: { items: Array<{ key: string; name: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-small text-fg-secondary">
      {items.map((i) => (
        <li key={i.key} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: i.color }} aria-hidden />
          {i.name}
        </li>
      ))}
    </ul>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{
    name?: string | number;
    value?: unknown;
    dataKey?: unknown;
    payload?: { x?: string };
  }>;
  label: ReturnType<typeof useKeyLabel>;
  colors: Record<string, string>;
  unit: MetricResult["unit"];
  byName?: boolean;
}

function ChartTooltip({ active, payload, label, colors, unit, byName = false }: TooltipProps) {
  const t = useTranslations("analytics");
  const fmt = useFormatter();
  if (!active || !payload?.length) return null;
  const first = payload[0];
  const x = byName ? String(first?.name ?? "") : String(first?.payload?.x ?? "");
  const rows = byName
    ? [{ key: x, name: label.x(x), value: first?.value as number | null }]
    : payload.map((p) => ({
        key: String(p.dataKey),
        name: label.series(String(p.dataKey)),
        value: p.value as number | null,
      }));
  return (
    <div className="min-w-40 rounded-card border border-border bg-surface px-3 py-2 text-small shadow-popover">
      {!byName ? <p className="mb-1 font-medium text-fg">{label.x(x)}</p> : null}
      <ul className="flex flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-fg-secondary">
            <span className="size-2 shrink-0 rounded-full" style={{ background: colors[r.key] }} />
            <span className="flex-1 truncate">{r.name}</span>
            <span className="font-medium text-fg tabular">
              {r.value === null || r.value === undefined
                ? "–"
                : unit === "days"
                  ? t("days", { n: fmt.number(r.value, { maximumFractionDigits: 1 }) })
                  : fmt.number(r.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stat tile: the headline, a delta against the previous window, in text tokens. */
function NumberTile({ data }: { data: MetricResult }) {
  const t = useTranslations("analytics");
  const fmt = useFormatter();
  const value = data.total;
  const delta =
    value !== null && data.previous !== null && data.previous !== undefined
      ? value - data.previous
      : null;
  const good = GOOD[data.metric];
  const tone =
    delta === null || delta === 0 || !good
      ? "text-fg-muted bg-surface-muted"
      : delta > 0 === (good === "up")
        ? "text-success-text bg-success-bg"
        : "text-danger-text bg-danger-bg";
  return (
    <div className="flex min-h-24 flex-col gap-1.5" data-testid="number-tile">
      <p className="text-display font-semibold text-fg">
        {value === null
          ? "–"
          : data.unit === "days"
            ? t("days", { n: fmt.number(value, { maximumFractionDigits: 1 }) })
            : fmt.number(value, { notation: value >= 10_000 ? "compact" : "standard" })}
      </p>
      {delta !== null ? (
        <p className="flex items-center gap-2 text-small text-fg-muted">
          <span className={cn("rounded-[6px] px-1.5 py-0.5 font-medium tabular", tone)}>
            {delta > 0 ? "+" : ""}
            {fmt.number(delta, { maximumFractionDigits: 1 })}
          </span>
          {t("vsPrevious")}
        </p>
      ) : data.unit === "days" ? (
        <p className="text-small text-fg-muted">{t("median")}</p>
      ) : null}
    </div>
  );
}

/** The table view: every value readable without hovering. */
export function ChartTable({
  data,
  label,
}: {
  data: MetricResult;
  label: ReturnType<typeof useKeyLabel>;
}) {
  const t = useTranslations("analytics");
  const fmt = useFormatter();
  return (
    <div className="max-h-[260px] scrollbar-thin overflow-auto">
      <table className="w-full text-small">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-border text-left text-caption text-fg-muted">
            <th className="py-1.5 pr-3 font-medium">{t(`axis.${data.xAxis}` as never)}</th>
            {data.series.map((s) => (
              <th key={s} className="py-1.5 pl-3 text-right font-medium">
                {label.series(s)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.x.map((x) => (
            <tr key={x} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3 text-fg-secondary">{label.x(x)}</td>
              {data.series.map((s) => {
                const v = data.values[x]?.[s];
                return (
                  <td key={s} className="py-1.5 pl-3 text-right text-fg tabular">
                    {v === null || v === undefined ? "–" : fmt.number(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
