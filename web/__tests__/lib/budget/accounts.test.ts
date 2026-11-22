import { describe, expect, it } from "vitest";
import { accountBreakdown } from "@/lib/budget/accounts";
import { summarize } from "@/lib/budget/summary";
import type { AdHocPayment, Bill, Income } from "@/lib/budget/types";

const c = (d: number) => d * 100;
const banks = [
  { id: 1, name: "Mom's", balance: c(1000) },
  { id: 2, name: "Dad's", balance: c(500) },
];
const bill = (name: string, status: Bill["status"], projected: number, bankId: number | null): Bill => ({
  name,
  status,
  projected: c(projected),
  startBalance: 0,
  bankId,
});

describe("accountBreakdown", () => {
  it("splits bills, one-offs and income by account", () => {
    const bills = [bill("Water", "Pending", 100, 1), bill("Electric", "Pending", 50, 2), bill("Rent", "Paid", 700, 1)];
    const adHoc: AdHocPayment[] = [{ name: "Principal", status: "Pending", projected: c(500), bankId: 2 }];
    const incomes: Income[] = [
      { amount: c(300), status: "Pending", bankId: 1 },
      { amount: c(900), status: "Received", bankId: 1 },
    ];
    const lines = accountBreakdown(banks, { bills, adHoc, incomes });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ name: "Mom's", balance: c(1000), incomeToArrive: c(300), billsToPay: c(100), oneOffsToPay: 0, cushion: c(1200) });
    expect(lines[1]).toMatchObject({ name: "Dad's", incomeToArrive: 0, billsToPay: c(50), oneOffsToPay: c(500), cushion: c(-50) });
  });

  it("tracks sent-not-cleared payments and the difference per account", () => {
    const bills = [bill("Card", "Payment Made", 200, 1), bill("Loan", "Payment Made", 80, 2)];
    const [mom, dad] = accountBreakdown(banks, { bills, adHoc: [], incomes: [] });
    expect(mom.paymentMade).toBe(c(200));
    expect(mom.difference).toBe(c(800));
    expect(dad.difference).toBe(c(420));
  });

  it("gathers items with no account, or a missing one, in a No account line", () => {
    const bills = [bill("A", "Pending", 30, null), bill("B", "Pending", 20, 99), bill("C", "Pending", 10, 1)];
    const lines = accountBreakdown(banks, { bills, adHoc: [], incomes: [] });
    expect(lines.map((l) => l.name)).toEqual(["Mom's", "Dad's", "No account"]);
    expect(lines[2]).toMatchObject({ id: null, billsToPay: c(50), cushion: c(-50) });
  });

  it("has no No account line when everything is assigned", () => {
    expect(accountBreakdown(banks, { bills: [bill("A", "Pending", 30, 1)], adHoc: [], incomes: [] }).map((l) => l.id)).toEqual([1, 2]);
  });

  it("lines always add up to the month's total cushion", () => {
    const bills = [bill("A", "Pending", 30, 1), bill("B", "Pending", 20, null), bill("C", "Paid", 90, 2)];
    const adHoc: AdHocPayment[] = [{ name: "Z", status: "Pending", projected: c(11), bankId: null }];
    const incomes: Income[] = [{ amount: c(70), status: "Pending", bankId: 2 }, { amount: c(5), status: "Pending", bankId: null }];
    const lines = accountBreakdown(banks, { bills, adHoc, incomes });
    const total = summarize({ bills, adHoc, incomes, banks: banks.map((b) => b.balance) }).cushion;
    expect(lines.reduce((a, l) => a + l.cushion, 0)).toBe(total);
  });
});
