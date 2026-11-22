import { cushion } from "./formulas";
import type { AdHocPayment, Bill, Cents, Income } from "./types";

export interface TrendPoint {
  ym: string;
  income: Cents;
  spending: Cents;
  cushion: Cents;
}

export interface MonthInput {
  ym: string;
  bills: Bill[];
  adHoc: AdHocPayment[];
  incomes: Income[];
  banks: Cents[];
}

/**
 * One point per month, oldest first: what came in, what was planned to go out
 * (bills and one-offs, not counting items set to "None"), and the cushion.
 */
export function trend(months: MonthInput[]): TrendPoint[] {
  return [...months]
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .map((m) => ({
      ym: m.ym,
      income: m.incomes.reduce((a, i) => a + i.amount, 0),
      spending: [...m.bills, ...m.adHoc].filter((p) => p.status !== "None").reduce((a, p) => a + p.projected, 0),
      cushion: cushion(
        m.banks.reduce((a, b) => a + b, 0),
        m.incomes,
        m.bills,
        m.adHoc,
      ),
    }));
}

/** A round-number ceiling for a chart's y axis, so four ticks read 0 / 1K / 2K. */
export function niceMax(cents: number): number {
  const dollars = Math.max(cents / 100, 1);
  const pow = 10 ** Math.floor(Math.log10(dollars));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 4 >= dollars) ?? 10 * pow;
  return step * 4 * 100;
}
