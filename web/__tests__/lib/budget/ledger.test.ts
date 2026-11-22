import { describe, expect, it } from "vitest";
import { carryBalances, type LedgerMonth } from "@/lib/budget/ledger";

const c = (d: number) => d * 100;

const jan: LedgerMonth = {
  accounts: [{ id: 1, name: "Checking", stored: c(1000) }],
  incomes: [
    { bankId: 1, amount: c(500), status: "Received" },
    { bankId: 1, amount: c(300), status: "Pending" },
  ],
  payments: [
    { bankId: 1, amount: c(200), status: "Paid" },
    { bankId: 1, amount: c(100), status: "Payment Made" },
    { bankId: 1, amount: c(50), status: "Pending" },
    { bankId: null, amount: c(999), status: "Paid" },
  ],
};

describe("carryBalances", () => {
  it("moves a balance by received income and paid or made payments only", () => {
    const [line] = carryBalances([jan])[0];
    expect(line).toMatchObject({ opening: c(1000), balance: c(1200), incomeToArrive: c(300), toPay: c(50), closing: c(1450), carried: false });
  });

  it("opens the next month with the projected end of the last, matched by name in any case", () => {
    const feb: LedgerMonth = {
      accounts: [{ id: 7, name: " checking ", stored: c(5) }],
      incomes: [{ bankId: 7, amount: c(10), status: "Received" }],
      payments: [],
    };
    const [, [line]] = carryBalances([jan, feb]);
    expect(line).toMatchObject({ id: 7, opening: c(1450), balance: c(1460), carried: true });
  });

  it("starts an account that is new this month from its typed opening balance", () => {
    const feb: LedgerMonth = { accounts: [{ id: 2, name: "Savings", stored: c(300) }], incomes: [], payments: [] };
    expect(carryBalances([jan, feb])[1][0]).toMatchObject({ opening: c(300), carried: false });
  });
});
