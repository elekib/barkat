import { outstanding, paymentMadeTotal } from "./formulas";
import type { AdHocPayment, Bill, Cents, Income } from "./types";

export interface AccountInput {
  id: number;
  name: string;
  balance: Cents;
}

export interface AccountLine {
  /** Bank row id, or null for money with no account chosen. */
  id: number | null;
  name: string;
  balance: Cents;
  /** Pending income that goes into this account. */
  incomeToArrive: Cents;
  billsToPay: Cents;
  oneOffsToPay: Cents;
  /** Payments marked "Payment Made" that have left this account but not cleared. */
  paymentMade: Cents;
  /** balance + incomeToArrive - billsToPay - oneOffsToPay (the sheet's cushion, per account). */
  cushion: Cents;
  /** balance - paymentMade (the sheet's "Payment Difference", per account). */
  difference: Cents;
}

/**
 * The cushion split by account: each account's balance, the pending income due into it,
 * and the bills and one-offs that come out of it. Anything without a chosen account (or
 * pointing at an account that is gone) is gathered in an "No account" line, shown only when
 * it holds something. The lines' cushions always add up to the month's total cushion.
 */
export function accountBreakdown(
  banks: AccountInput[],
  data: { bills: Bill[]; adHoc: AdHocPayment[]; incomes: Income[] },
): AccountLine[] {
  const known = new Set(banks.map((b) => b.id));
  const sameAccount = (id: number | null) => (x: { bankId?: number | null }) => {
    const own = x.bankId != null && known.has(x.bankId) ? x.bankId : null;
    return own === id;
  };

  const line = (id: number | null, name: string, balance: Cents): AccountLine => {
    const mine = sameAccount(id);
    const bills = data.bills.filter(mine);
    const oneOffs = data.adHoc.filter(mine);
    const incomeToArrive = data.incomes.filter(mine).reduce((a, i) => a + (i.status === "Pending" ? i.amount : 0), 0);
    const billsToPay = bills.reduce((a, b) => a + outstanding(b), 0);
    const oneOffsToPay = oneOffs.reduce((a, b) => a + outstanding(b), 0);
    const paymentMade = paymentMadeTotal([...bills, ...oneOffs]);
    return {
      id,
      name,
      balance,
      incomeToArrive,
      billsToPay,
      oneOffsToPay,
      paymentMade,
      cushion: balance + incomeToArrive - billsToPay - oneOffsToPay,
      difference: balance - paymentMade,
    };
  };

  const lines = banks.map((b) => line(b.id, b.name || "Untitled account", b.balance));
  const loose = line(null, "No account", 0);
  const hasLoose = loose.incomeToArrive !== 0 || loose.billsToPay !== 0 || loose.oneOffsToPay !== 0 || loose.paymentMade !== 0;
  return hasLoose ? [...lines, loose] : lines;
}
