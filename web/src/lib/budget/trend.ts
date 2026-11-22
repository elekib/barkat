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
