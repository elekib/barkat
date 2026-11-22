import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/budget/summary";

const c = (d: number) => d * 100;

describe("summarize", () => {
  it("reproduces the original sheet's headline numbers", () => {
    const s = summarize({
      bills: [
        { name: "A", status: "Payment Made", projected: c(500), startBalance: c(200) },
        { name: "B", status: "Payment Made", projected: c(600), startBalance: c(400) },
        { name: "C", status: "Paid", projected: c(400), startBalance: c(700) },
        { name: "D", status: "Payment Made", projected: c(1500), startBalance: c(1200) },
      ],
      adHoc: [],
      incomes: [
        { amount: c(500), status: "Received" },
        { amount: c(500), status: "Pending" },
      ],
      banks: [c(13000)],
    });
    expect(s.outstandingBills).toBe(c(2600));
    expect(s.paymentMade).toBe(c(2600));
    expect(s.paymentDifference).toBe(c(10400));
    expect(s.pendingIncome).toBe(c(500));
    expect(s.cushion).toBe(c(10900));
    expect(s.cushionLabel).toBe("Saving");
  });

  it("adds banks together and subtracts ad-hoc from the same cushion", () => {
    const s = summarize({
      bills: [],
      adHoc: [{ name: "Principal", status: "Pending", projected: c(500), tag: "Loan principal" }],
      incomes: [],
      banks: [c(1000), c(250)],
    });
    expect(s.bankTotal).toBe(c(1250));
    expect(s.outstandingAdHoc).toBe(c(500));
    expect(s.cushion).toBe(c(750));
    expect(s.adHocByTag).toEqual({ "Loan principal": c(500) });
  });

  it("calls a negative cushion Debt", () => {
    const s = summarize({
      bills: [{ name: "X", status: "Pending", projected: c(100), startBalance: 0 }],
      adHoc: [],
      incomes: [],
      banks: [c(50)],
    });
    expect(s.cushion).toBe(-c(50));
    expect(s.cushionLabel).toBe("Debt");
  });
});
