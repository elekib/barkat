/** Money is always whole cents, never floats. */
export type Cents = number;

/** Status of one bill in a month. Mirrors the spreadsheet's drop-down. */
export const BILL_STATUSES = ["None", "Pending", "Payment Made", "Paid"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

/** Status of one expected income. Mirrors the spreadsheet's drop-down. */
export const INCOME_STATUSES = ["Pending", "Received"] as const;
export type IncomeStatus = (typeof INCOME_STATUSES)[number];

/** Anything you pay out of an account this month: a bill or an ad-hoc payment. */
export interface Payable {
  name: string;
  status: BillStatus;
  /** "Expense Projected": what you expect to pay this month. */
  projected: Cents;
  /** The account it comes out of (a bank row id), if one is chosen. */
  bankId?: number | null;
}

export interface Bill extends Payable {
  /** "Payment Amount (Start)": the balance before this month's payment. */
  startBalance: Cents;
}

export interface Income {
  /** What it is, when the caller has it ("Paycheck"). */
  label?: string;
  amount: Cents;
  status: IncomeStatus;
  /** The account it goes into (a bank row id), if one is chosen. */
  bankId?: number | null;
}

/**
 * A one-off payment for the month that is not a recurring bill: a principal-only
 * mortgage payment, zakat, a trip. It comes out of the same account and the same
 * cushion as bills, but is kept separate so it can be tagged and summed on its own.
 */
export interface AdHocPayment extends Payable {
  /** Free-form label, for example "Loan principal", "Charity", "Travel". */
  tag?: string;
  /** Optional bill or loan this payment reduces, by name. */
  linkedTo?: string;
}
