import { outstanding, paidAmount } from "./formulas";
import type { AdHocPayment, Bill, Cents, Income, Payable } from "./types";

/**
 * Numbers for the dashboard, derived from one month's rows. Everything here is
 * pure so it can be tested. Items with status "None" are not part of the month
 * (the sheet's "nothing due"), so they are left out of totals and rankings.
 */

export interface StatusSplit {
  paid: Cents;
  paymentMade: Cents;
  pending: Cents;
}

export interface NextDue {
  name: string;
  dueDay: number;
  /** Days from today; negative when overdue. Null when no "today" was given. */
  days: number | null;
}

export interface MonthMetrics {
  /** Bills and one-offs in the month, by status. */
  split: StatusSplit;
  planned: Cents;
  paid: Cents;
  /** Share of planned spending already paid, 0 to 1. Null with nothing planned. */
  paidShare: number | null;
  billsPaidCount: number;
  billsCount: number;
  incomeTotal: Cents;
  incomeReceived: Cents;
  /** Share of expected income already received, 0 to 1. Null with no income. */
  incomeShare: number | null;
  /** Income minus everything planned. */
  left: Cents;
  /** left / income. Null with no income. */
  savingsRate: number | null;
  largest: { name: string; amount: Cents }[];
  nextDue: NextDue | null;
}

const planned = (p: Payable) => p.status !== "None";

export function splitByStatus(items: Payable[]): StatusSplit {
  const split: StatusSplit = { paid: 0, paymentMade: 0, pending: 0 };
  for (const p of items) {
    if (p.status === "Paid") split.paid += p.projected;
    else if (p.status === "Payment Made") split.paymentMade += p.projected;
    else if (p.status === "Pending") split.pending += p.projected;
  }
  return split;
}

/**
 * The bill to look at next: among unpaid bills with a due day, the nearest one
 * from `todayDay` on, or the most overdue if none is still ahead. Without a
 * "today" (a month other than the current one) it is the earliest due day.
 */
export function nextDue(bills: (Bill & { dueDay?: number | null })[], todayDay: number | null): NextDue | null {
  const open = bills.filter((b) => outstanding(b) > 0 && b.dueDay != null) as (Bill & { dueDay: number })[];
  if (open.length === 0) return null;
  if (todayDay === null) {
    const first = [...open].sort((a, b) => a.dueDay - b.dueDay)[0];
    return { name: first.name, dueDay: first.dueDay, days: null };
  }
  const withDays = open.map((b) => ({ b, days: b.dueDay - todayDay }));
  const ahead = withDays.filter((x) => x.days >= 0).sort((a, b) => a.days - b.days);
  const pick = ahead[0] ?? [...withDays].sort((a, b) => b.days - a.days)[0];
  return { name: pick.b.name, dueDay: pick.b.dueDay, days: pick.days };
}

export type DueLevel = "overdue" | "soon" | "later" | "clear";

export interface DueStatus {
  level: DueLevel;
  /** The bill to look at: the most overdue, else the soonest. Empty when clear. */
  name: string;
  dueDay: number | null;
  /** Days until it is due (negative when overdue). Null for a month that is not the current one. */
  days: number | null;
  overdueCount: number;
  /** Bills still to pay that have a due day. */
  openCount: number;
}

/** A bill closer than this many days away counts as due soon. */
export const SOON_DAYS = 3;

/**
 * How urgent the unpaid bills are, for the badge in the page header. Only bills whose payment
 * has not been made yet (status Pending) with a due day count: once you mark a payment made,
 * it stops nagging. Overdue wins over soon wins over later.
 */
export function dueStatus(bills: (Bill & { dueDay?: number | null })[], todayDay: number | null): DueStatus {
  const open = bills.filter((b) => b.status === "Pending" && b.dueDay != null) as (Bill & { dueDay: number })[];
  if (open.length === 0) return { level: "clear", name: "", dueDay: null, days: null, overdueCount: 0, openCount: 0 };
  if (todayDay === null) {
    const first = [...open].sort((a, b) => a.dueDay - b.dueDay)[0];
    return { level: "later", name: first.name, dueDay: first.dueDay, days: null, overdueCount: 0, openCount: open.length };
  }
  const withDays = open.map((b) => ({ b, days: b.dueDay - todayDay })).sort((a, b) => a.days - b.days);
  const overdue = withDays.filter((x) => x.days < 0);
  const pick = overdue[0] ?? withDays[0];
  const level: DueLevel = overdue.length > 0 ? "overdue" : pick.days <= SOON_DAYS ? "soon" : "later";
  return { level, name: pick.b.name, dueDay: pick.b.dueDay, days: pick.days, overdueCount: overdue.length, openCount: open.length };
}

export function monthMetrics(input: {
  bills: (Bill & { dueDay?: number | null })[];
  adHoc: AdHocPayment[];
  incomes: Income[];
  todayDay: number | null;
}): MonthMetrics {
  const items = [...input.bills, ...input.adHoc].filter(planned);
  const plannedTotal = items.reduce((a, p) => a + p.projected, 0);
  const paid = items.reduce((a, p) => a + paidAmount(p), 0);
  const incomeTotal = input.incomes.reduce((a, i) => a + i.amount, 0);
  const incomeReceived = input.incomes.filter((i) => i.status === "Received").reduce((a, i) => a + i.amount, 0);
  const left = incomeTotal - plannedTotal;
  const bills = input.bills.filter((b) => planned(b) && b.projected > 0);

  return {
    split: splitByStatus(items),
    planned: plannedTotal,
    paid,
    paidShare: plannedTotal > 0 ? paid / plannedTotal : null,
    billsPaidCount: bills.filter((b) => b.status === "Paid").length,
    billsCount: bills.length,
    incomeTotal,
    incomeReceived,
    incomeShare: incomeTotal > 0 ? incomeReceived / incomeTotal : null,
    left,
    savingsRate: incomeTotal > 0 ? left / incomeTotal : null,
    largest: [...items]
      .filter((p) => p.projected > 0)
      .sort((a, b) => b.projected - a.projected)
      .slice(0, 5)
      .map((p) => ({ name: p.name || "Untitled", amount: p.projected })),
    nextDue: nextDue(input.bills, input.todayDay),
  };
}
