import { describe, expect, it } from "vitest";
import { dueStatus, monthMetrics, nextDue, splitByStatus } from "@/lib/budget/metrics";
import { trend } from "@/lib/budget/trend";
import type { AdHocPayment, Bill, Income } from "@/lib/budget/types";

const c = (d: number) => d * 100;
type B = Bill & { dueDay?: number | null };

const bills: B[] = [
  { name: "Card", status: "Paid", projected: c(400), startBalance: c(700), dueDay: 12 },
  { name: "Power", status: "Payment Made", projected: c(600), startBalance: c(400), dueDay: 23 },
  { name: "Mortgage", status: "Pending", projected: c(1500), startBalance: c(1200), dueDay: 25 },
  { name: "Water", status: "None", projected: c(0), startBalance: 0, dueDay: 27 },
];
const adHoc: AdHocPayment[] = [{ name: "Zakat", status: "Paid", projected: c(1000), tag: "Charity" }];
const incomes: Income[] = [
  { amount: c(2000), status: "Received" },
  { amount: c(2000), status: "Pending" },
];

describe("monthMetrics", () => {
  const m = monthMetrics({ bills, adHoc, incomes, todayDay: 20 });

  it("splits planned spending by status, leaving None out", () => {
    expect(m.split).toEqual({ paid: c(1400), paymentMade: c(600), pending: c(1500) });
    expect(m.planned).toBe(c(3500));
  });

  it("measures how much is paid and how many bills", () => {
    expect(m.paid).toBe(c(1400));
    expect(m.paidShare).toBeCloseTo(0.4);
    expect(m.billsPaidCount).toBe(1);
    expect(m.billsCount).toBe(3);
  });

  it("measures income, what is left and the savings rate", () => {
    expect(m.incomeTotal).toBe(c(4000));
    expect(m.incomeReceived).toBe(c(2000));
    expect(m.incomeShare).toBe(0.5);
    expect(m.left).toBe(c(500));
    expect(m.savingsRate).toBeCloseTo(0.125);
  });

  it("ranks the largest payments", () => {
    expect(m.largest.map((x) => x.name)).toEqual(["Mortgage", "Zakat", "Power", "Card"]);
  });

  it("has no ratios when there is nothing to divide by", () => {
    const empty = monthMetrics({ bills: [], adHoc: [], incomes: [], todayDay: null });
    expect(empty.paidShare).toBeNull();
    expect(empty.incomeShare).toBeNull();
    expect(empty.savingsRate).toBeNull();
    expect(empty.nextDue).toBeNull();
  });
});

describe("nextDue", () => {
  it("picks the nearest unpaid bill from today on", () => {
    expect(nextDue(bills, 20)).toEqual({ name: "Power", dueDay: 23, days: 3 });
  });
  it("falls back to the most overdue when none is ahead", () => {
    expect(nextDue(bills, 28)).toEqual({ name: "Mortgage", dueDay: 25, days: -3 });
  });
  it("without a today, takes the earliest due day", () => {
    expect(nextDue(bills, null)).toEqual({ name: "Power", dueDay: 23, days: null });
  });
  it("ignores paid bills and bills without a due day", () => {
    expect(nextDue([{ ...bills[0] }, { ...bills[2], dueDay: null }], 1)).toBeNull();
  });
});

describe("splitByStatus", () => {
  it("sums each status", () => {
    expect(splitByStatus([...bills, ...adHoc]).paid).toBe(c(1400));
  });
});

describe("trend", () => {
  it("returns one point per month, oldest first", () => {
    const points = trend([
      { ym: "2027-01", bills: [], adHoc: [], incomes: [{ amount: c(500), status: "Pending" }], banks: [c(100)] },
      { ym: "2026-12", bills, adHoc, incomes, banks: [c(13000)] },
    ]);
    expect(points.map((p) => p.ym)).toEqual(["2026-12", "2027-01"]);
    expect(points[0]).toEqual({ ym: "2026-12", income: c(4000), spending: c(3500), cushion: c(13000 + 2000 - 2100) });
    expect(points[1]).toMatchObject({ income: c(500), spending: 0, cushion: c(600) });
  });
});

describe("dueStatus", () => {
  const bill = (name: string, status: Bill["status"], dueDay: number | null) => ({ name, status, projected: 100, startBalance: 0, dueDay });

  it("is clear when nothing unpaid has a due day", () => {
    expect(dueStatus([], 10).level).toBe("clear");
    expect(dueStatus([bill("A", "Paid", 5), bill("B", "Pending", null)], 10).level).toBe("clear");
  });

  it("ignores bills whose payment was already made", () => {
    expect(dueStatus([bill("A", "Payment Made", 5)], 10).level).toBe("clear");
  });

  it("goes red when any bill is past due, naming the most overdue", () => {
    const d = dueStatus([bill("Late", "Pending", 5), bill("Later", "Pending", 8), bill("Soon", "Pending", 12)], 10);
    expect(d).toMatchObject({ level: "overdue", name: "Late", days: -5, overdueCount: 2, openCount: 3 });
  });

  it("goes amber within three days and neutral beyond", () => {
    expect(dueStatus([bill("A", "Pending", 13)], 10)).toMatchObject({ level: "soon", days: 3 });
    expect(dueStatus([bill("A", "Pending", 10)], 10)).toMatchObject({ level: "soon", days: 0 });
    expect(dueStatus([bill("A", "Pending", 14)], 10)).toMatchObject({ level: "later", days: 4 });
  });

  it("shows the earliest due day, neutral, for a month that is not the current one", () => {
    expect(dueStatus([bill("B", "Pending", 20), bill("A", "Pending", 3)], null)).toMatchObject({ level: "later", name: "A", dueDay: 3, days: null });
  });
});
