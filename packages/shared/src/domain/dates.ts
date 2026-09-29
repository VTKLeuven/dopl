/**
 * Calendar-date helpers on "YYYY-MM-DD" strings. Pure and time-zone free:
 * the caller decides what "today" is (in the workspace time zone).
 */
import type { DateValue, Relative } from "../schemas/filters";

const MS_DAY = 86_400_000;

function toUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + days * MS_DAY));
}

/** Adds calendar months, clamping to the last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const d = toUtc(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return fromUtc(target);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return toUtc(date).getUTCDay();
}

export function startOfWeek(date: string, weekStartsOn: number): string {
  return addDays(date, -((weekday(date) - weekStartsOn + 7) % 7));
}

export function endOfWeek(date: string, weekStartsOn: number): string {
  return addDays(startOfWeek(date, weekStartsOn), 6);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

export function endOfMonth(date: string): string {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / MS_DAY);
}

/** Today's calendar date in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface DateContext {
  today: string;
  weekStartsOn: number;
}

export function resolveDate(value: DateValue, ctx: DateContext): string {
  switch (value) {
    case "today":
      return ctx.today;
    case "yesterday":
      return addDays(ctx.today, -1);
    case "tomorrow":
      return addDays(ctx.today, 1);
    case "startOfWeek":
      return startOfWeek(ctx.today, ctx.weekStartsOn);
    case "endOfWeek":
      return endOfWeek(ctx.today, ctx.weekStartsOn);
    case "startOfMonth":
      return startOfMonth(ctx.today);
    case "endOfMonth":
      return endOfMonth(ctx.today);
    default:
      return value;
  }
}

/** Shift a date by a relative amount (negative for the past). */
export function shift(date: string, rel: Relative, sign: 1 | -1): string {
  switch (rel.unit) {
    case "day":
      return addDays(date, sign * rel.amount);
    case "week":
      return addDays(date, sign * rel.amount * 7);
    case "month":
      return addMonths(date, sign * rel.amount);
  }
}

/** Inclusive calendar range for "within the last/next N units", anchored on today. */
export function relativeRange(
  op: "withinLast" | "withinNext",
  rel: Relative,
  ctx: DateContext,
): [string, string] {
  return op === "withinLast"
    ? [shift(ctx.today, rel, -1), ctx.today]
    : [ctx.today, shift(ctx.today, rel, 1)];
}

/** Every date from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
