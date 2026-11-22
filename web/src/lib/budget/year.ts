import { trend, type MonthInput } from "./trend";
import type { Cents } from "./types";

/** One month as the year view takes it: the trend numbers, and whether the month holds anything at all. */
export interface YearInput {
  ym: string;
  income: Cents;
  spending: Cents;
  cushion: Cents;
  /** True for a month that was started but has no rows. It counts as no data, not as a month of zeros. */
  empty: boolean;
}

export type YearMonthStatus = "data" | "empty" | "missing";

export interface YearMonth {
  ym: string;
  status: YearMonthStatus;
  income: Cents;
  spending: Cents;
  /** Income less spending planned. Spending leaves out items set to None, as in the trend. */
  saved: Cents;
  /** What the month was expected to end with; null when there is no data for it. */
  cushion: Cents | null;
}

export interface YearFigures {
  income: Cents;
  spending: Cents;
  saved: Cents;
  cushion: Cents | null;
}

export interface YearView {
  year: number;
  months: YearMonth[];
  /** Months with data: the ones the totals and averages are made of. */
  counted: number;
  /** Totals; the cushion is the year's last month with data, since a cushion is a position, not a flow. */
  totals: YearFigures;
  /** The average of a month with data, rounded to whole cents; the cushion is the average position. Null with no data. */
  average: YearFigures | null;
  /** Saved as a share of income. Null with no income. */
  savingsRate: number | null;
  /** The first and last month with data, for the chart's caption. */
  first: string | null;
  last: string | null;
}

/** The twelve months of `year`, with totals and the average month. Months with no data are listed but not counted. */
export function yearView(inputs: readonly YearInput[], year: number): YearView {
  const byYm = new Map(inputs.map((m) => [m.ym, m]));
  const months: YearMonth[] = Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
    const m = byYm.get(ym);
    if (!m) return { ym, status: "missing", income: 0, spending: 0, saved: 0, cushion: null };
    if (m.empty) return { ym, status: "empty", income: 0, spending: 0, saved: 0, cushion: null };
    return { ym, status: "data", income: m.income, spending: m.spending, saved: m.income - m.spending, cushion: m.cushion };
  });
  const live = months.filter((m) => m.status === "data");
  const sum = (pick: (m: YearMonth) => Cents) => live.reduce((a, m) => a + pick(m), 0);
  const totals: YearFigures = {
    income: sum((m) => m.income),
    spending: sum((m) => m.spending),
    saved: sum((m) => m.saved),
    cushion: live.length > 0 ? live[live.length - 1].cushion : null,
  };
  const mean = (cents: Cents) => Math.round(cents / live.length);
  return {
    year,
    months,
    counted: live.length,
    totals,
    average:
      live.length === 0
        ? null
        : { income: mean(totals.income), spending: mean(totals.spending), saved: mean(totals.saved), cushion: mean(sum((m) => m.cushion ?? 0)) },
    savingsRate: totals.income > 0 ? totals.saved / totals.income : null,
    first: live[0]?.ym ?? null,
    last: live[live.length - 1]?.ym ?? null,
  };
}

/** Years that have at least one month with data, newest first. */
export function yearsWithData(inputs: readonly YearInput[]): number[] {
  return [...new Set(inputs.filter((m) => !m.empty).map((m) => Number(m.ym.slice(0, 4))))].sort((a, b) => b - a);
}

export function isYear(value: string): boolean {
  return /^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= 2200;
}

/** True for the entries Barkat itself adds to make balances meet (an import's join, a converted book): corrections, not income or spending. */
export function isAdjustment(name: string): boolean {
  return name.trim().toLowerCase() === "adjustment";
}

/**
 * The year view's months from each month's rows. Income and spending leave out Adjustment entries, so a
 * correction that makes balances meet never reads as money earned or spent; the cushion keeps them, since
 * they are in the balances. `sizes` maps a started month to how many rows it holds (none: it is empty).
 */
export function yearInputs(months: MonthInput[], sizes: ReadonlyMap<string, number>): YearInput[] {
  const flows = new Map(
    trend(months.map((m) => ({ ...m, incomes: m.incomes.filter((i) => !isAdjustment(i.label ?? "")), adHoc: m.adHoc.filter((a) => !isAdjustment(a.name)) }))).map((p) => [p.ym, p]),
  );
  return trend(months).map((p) => ({
    ym: p.ym,
    income: flows.get(p.ym)!.income,
    spending: flows.get(p.ym)!.spending,
    cushion: p.cushion,
    empty: (sizes.get(p.ym) ?? 0) === 0,
  }));
}
