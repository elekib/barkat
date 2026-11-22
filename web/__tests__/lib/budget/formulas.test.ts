import { describe, expect, it } from "vitest";
import {
  addDays,
  adHocByTag,
  adHocOutstanding,
  cushion,
  cushionLabel,
  endBalance,
  outstanding,
  paidAmount,
  paymentDifference,
  paymentMadeTotal,
  pendingIncome,
  totalOutstanding,
} from "@/lib/budget/formulas";
import type { AdHocPayment, Bill, Income } from "@/lib/budget/types";

const c = (dollars: number) => dollars * 100;

// Made-up bills that reproduce the shape of the original December sheet.
const bills: Bill[] = [
  { name: "Card A", status: "None", projected: 0, startBalance: 0 },
  { name: "Card B", status: "Payment Made", projected: c(500), startBalance: c(200) },
  { name: "Power", status: "Payment Made", projected: c(600), startBalance: c(400) },
  { name: "Wholesale club", status: "Paid", projected: c(400), startBalance: c(700) },
  { name: "Mortgage", status: "Payment Made", projected: c(1500), startBalance: c(1200) },
];

const incomes: Income[] = [
  { amount: c(500), status: "Received" },
  { amount: c(500), status: "Received" },
  { amount: c(500), status: "Received" },
  { amount: c(500), status: "Pending" },
];

describe("per-bill formulas", () => {
  it("outstanding ignores Paid and None", () => {
    expect(outstanding(bills[0])).toBe(0);
    expect(outstanding(bills[3])).toBe(0);
    expect(outstanding(bills[1])).toBe(c(500));
    expect(outstanding({ ...bills[1], status: "Pending" })).toBe(c(500));
  });

  it("paid amount is the projected amount only when Paid", () => {
    expect(paidAmount(bills[3])).toBe(c(400));
    expect(paidAmount(bills[1])).toBe(0);
  });

  it("end balance is start minus paid", () => {
    expect(endBalance(bills[3])).toBe(c(300));
    expect(endBalance(bills[2])).toBe(c(400));
  });
});

describe("month totals (original sheet: 2600 outstanding, 10900 cushion)", () => {
  it("totals outstanding and in-flight payments", () => {
    expect(totalOutstanding(bills)).toBe(c(2600));
    expect(paymentMadeTotal(bills)).toBe(c(2600));
  });

  it("payment difference is bank minus in-flight payments", () => {
    expect(paymentDifference(c(13000), bills)).toBe(c(10400));
  });

  it("pending income only counts Pending rows", () => {
    expect(pendingIncome(incomes)).toBe(c(500));
  });

  it("cushion is bank plus pending income minus outstanding", () => {
    const value = cushion(c(13000), incomes, bills);
    expect(value).toBe(c(10900));
    expect(cushionLabel(value)).toBe("Saving");
  });

  it("labels a zero or negative cushion as Debt", () => {
    expect(cushionLabel(0)).toBe("Debt");
    expect(cushionLabel(-1)).toBe("Debt");
  });
});

describe("addDays", () => {
  it("steps weekly across a month and year boundary", () => {
    expect(addDays("2026-11-27", 7)).toBe("2026-12-04");
    expect(addDays("2026-12-25", 7)).toBe("2027-01-01");
  });
});

describe("ad-hoc payments", () => {
  const adHoc: AdHocPayment[] = [
    { name: "Mortgage principal", status: "Pending", projected: c(500), tag: "Loan principal", linkedTo: "Mortgage" },
    { name: "Zakat", status: "Paid", projected: c(1000), tag: "Charity" },
    { name: "Summer trip", status: "Pending", projected: c(800), tag: "Travel" },
    { name: "Misc", status: "Payment Made", projected: c(50) },
  ];

  it("counts only unpaid ad-hoc payments as outstanding", () => {
    expect(adHocOutstanding(adHoc)).toBe(c(1350));
  });

  it("lowers the same cushion as bills", () => {
    const without = cushion(c(13000), incomes, bills);
    const withExtras = cushion(c(13000), incomes, bills, adHoc);
    expect(without - withExtras).toBe(c(1350));
    expect(withExtras).toBe(c(9550));
  });

  it("in-flight ad-hoc payments count toward the payment difference", () => {
    expect(paymentDifference(c(13000), [...bills, ...adHoc])).toBe(c(10350));
  });

  it("sums by tag, with untagged under Other", () => {
    expect(adHocByTag(adHoc)).toEqual({
      "Loan principal": c(500),
      Charity: c(1000),
      Travel: c(800),
      Other: c(50),
    });
  });
});
