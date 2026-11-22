import type { Cents, BillStatus, IncomeStatus } from "./types";

/**
 * Account balances that carry from month to month.
 *
 * An account is its name (any case) across the months of a book. Its first month holds an
 * opening balance, typed by hand. Every later month opens with what the month before projected
 * for it (that month's cushion for the account), and then moves only by entries:
 *   balance = opening + income Received - bills and one-offs Paid or Payment Made (+ an admin override).
 * Anything with no account chosen does not touch a balance. A correction is an entry
 * (an "Adjustment" income or one-off), never an edit of the balance.
 */

export interface LedgerAccount {
  id: number;
  name: string;
  /** The typed opening balance. Only used in the account's first month. */
  stored: Cents;
  /** An admin override of this month's balance: added on top of the entries. */
  adjust?: Cents;
}

export interface LedgerFlow {
  bankId: number | null;
  amount: Cents;
  status: BillStatus | IncomeStatus;
}

export interface LedgerMonth {
  accounts: LedgerAccount[];
  /** Money in: status "Received" or "Pending". */
  incomes: LedgerFlow[];
  /** Money out (bills and one-offs): status "Paid", "Payment Made", "Pending" or "None". */
  payments: LedgerFlow[];
}

export interface LedgerLine {
  id: number;
  /** Where the month starts for this account. */
  opening: Cents;
  /** Opening + received - paid - payment made: what the account holds now. */
  balance: Cents;
  /** Of the money out so far, what is marked Payment Made (sent, not yet confirmed Paid). */
  made: Cents;
  /** Income still to arrive, and bills still to pay (Pending only). */
  incomeToArrive: Cents;
  toPay: Cents;
  /** balance + incomeToArrive - toPay: what the month is expected to end with. */
  closing: Cents;
  /** True when the opening came from the month before, so it cannot be typed. */
  carried: boolean;
}

const key = (name: string) => name.trim().toLowerCase();

/** The ledger for each month, oldest first. Same length and order as `months`. */
export function carryBalances(months: LedgerMonth[]): LedgerLine[][] {
  const result: LedgerLine[][] = [];
  let before = new Map<string, LedgerLine>();

  for (const month of months) {
    const lines: LedgerLine[] = [];
    const now = new Map<string, LedgerLine>();
    for (const a of month.accounts) {
      const prev = before.get(key(a.name));
      const opening = prev ? prev.closing : a.stored;
      const mine = (f: LedgerFlow) => f.bankId === a.id;
      const sum = (flows: LedgerFlow[], ...on: string[]) => flows.filter((f) => mine(f) && on.includes(f.status)).reduce((x, f) => x + f.amount, 0);
      const received = sum(month.incomes, "Received");
      const incomeToArrive = sum(month.incomes, "Pending");
      const paid = sum(month.payments, "Paid", "Payment Made");
      const toPay = sum(month.payments, "Pending");
      const balance = opening + received - paid + (a.adjust ?? 0);
      const made = sum(month.payments, "Payment Made");
      const line: LedgerLine = { id: a.id, opening, balance, made, incomeToArrive, toPay, closing: balance + incomeToArrive - toPay, carried: !!prev };
      lines.push(line);
      now.set(key(a.name), line);
    }
    result.push(lines);
    before = now;
  }
  return result;
}
