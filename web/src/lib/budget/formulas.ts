import type { AdHocPayment, Bill, Cents, Income, Payable } from "./types";

/**
 * The spreadsheet's formulas as pure functions. Each one names the cell
 * formula it replaces so the behaviour can be checked against the original.
 */

/** Column A: `=IF(OR(C="Paid",C="None"),0,D)`. Still to be paid. */
export function outstanding(item: Payable): Cents {
  return item.status === "Paid" || item.status === "None" ? 0 : item.projected;
}

/** Column G: `=IF(C="Paid",D,0)`. */
export function paidAmount(item: Payable): Cents {
  return item.status === "Paid" ? item.projected : 0;
}

/** Column F: `=E-G`. Balance after this month's paid amount. */
export function endBalance(bill: Bill): Cents {
  return bill.startBalance - paidAmount(bill);
}

/** A21: `=SUM(A3:A20)`. Works for bills and for ad-hoc payments. */
export function totalOutstanding(items: Payable[]): Cents {
  return sum(items.map(outstanding));
}

/** C21: `=SUMIF(C,"Payment Made",A)`. Sent but not yet cleared. */
export function paymentMadeTotal(items: Payable[]): Cents {
  return sum(items.filter((i) => i.status === "Payment Made").map(outstanding));
}

/** C22: `=E27-C21`. What the bank holds after the in-flight payments clear. */
export function paymentDifference(bank: Cents, items: Payable[]): Cents {
  return bank - paymentMadeTotal(items);
}

/** Ad-hoc payments still to be paid this month. Same rule as bills. */
export function adHocOutstanding(payments: AdHocPayment[]): Cents {
  return totalOutstanding(payments);
}

/** Ad-hoc payments summed by tag, for the "where did it go" view. Untagged ones group under "Other". */
export function adHocByTag(payments: AdHocPayment[]): Record<string, Cents> {
  const totals: Record<string, Cents> = {};
  for (const p of payments) {
    const tag = p.tag?.trim() || "Other";
    totals[tag] = (totals[tag] ?? 0) + p.projected;
  }
  return totals;
}

/** A35: `=SUMIF(C,"Pending",A)`. Income expected but not received. */
export function pendingIncome(incomes: Income[]): Cents {
  return sum(incomes.filter((i) => i.status === "Pending").map((i) => i.amount));
}

/**
 * D27: `=(A35+E27)-A21`. Money left once pending income arrives and every
 * outstanding bill and ad-hoc payment is paid. Ad-hoc payments fall out of the
 * same cushion and account as bills.
 */
export function cushion(
  bank: Cents,
  incomes: Income[],
  bills: Bill[],
  adHoc: AdHocPayment[] = [],
): Cents {
  return pendingIncome(incomes) + bank - totalOutstanding(bills) - adHocOutstanding(adHoc);
}

/** D28: `=IF(D27>0,"Saving","Debt")`. */
export function cushionLabel(value: Cents): "Saving" | "Debt" {
  return value > 0 ? "Saving" : "Debt";
}

/** B28..B30: `=B27+7`. Weekly income dates. Works on ISO dates (YYYY-MM-DD). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
