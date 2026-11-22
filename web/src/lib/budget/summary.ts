import {
  adHocByTag,
  adHocOutstanding,
  cushion,
  cushionLabel,
  paymentDifference,
  paymentMadeTotal,
  pendingIncome,
  totalOutstanding,
} from "./formulas";
import type { AdHocPayment, Bill, Cents, Income } from "./types";

export interface MonthData {
  bills: Bill[];
  adHoc: AdHocPayment[];
  incomes: Income[];
  /** Bank balances, one per account in the space. */
  banks: Cents[];
}

export interface MonthSummary {
  bankTotal: Cents;
  outstandingBills: Cents;
  outstandingAdHoc: Cents;
  paymentMade: Cents;
  paymentDifference: Cents;
  pendingIncome: Cents;
  cushion: Cents;
  cushionLabel: "Saving" | "Debt";
  adHocByTag: Record<string, Cents>;
}

/** Everything the top of the weekly screen shows, from one month's rows. */
export function summarize(data: MonthData): MonthSummary {
  const bankTotal = data.banks.reduce((a, b) => a + b, 0);
  const payables = [...data.bills, ...data.adHoc];
  const value = cushion(bankTotal, data.incomes, data.bills, data.adHoc);
  return {
    bankTotal,
    outstandingBills: totalOutstanding(data.bills),
    outstandingAdHoc: adHocOutstanding(data.adHoc),
    paymentMade: paymentMadeTotal(payables),
    paymentDifference: paymentDifference(bankTotal, payables),
    pendingIncome: pendingIncome(data.incomes),
    cushion: value,
    cushionLabel: cushionLabel(value),
    adHocByTag: adHocByTag(data.adHoc),
  };
}
