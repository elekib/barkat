/**
 * The workbook layout, taken from the original sheet. One sheet per month.
 *
 *   Row 1        month name (merged across)
 *   Row 2        headers: Expenses | Type | Payment Status | Expense Projected |
 *                Payment Amount(Start) | Payment Amount(End) | Paid Amount |
 *                Interest Status | Notes | Due | Scheduled Date
 *   Rows 3..     one row per bill, then one per one-off payment
 *   Total row    "Total" in B; "Payment Difference" on the row below
 *   Income block header row: Income | Date or What? | Status | Savings | <bank name> ...
 *                income rows under it; each bank has its balance and type under its name
 *
 * Columns beyond the original sheet (kept out of the way, ignored by the old sheet):
 *   L Kind ("One-off" for a one-off payment), M Tag, N Linked to (expense rows)
 *   O Paid from (expense rows: the account name)
 *   Q Label, R Into (income rows: the account name)
 */

export const SHEET_GAP_TO_INCOME = 4; // rows between "Payment Difference" and the income header
export const MIN_INCOME_ROWS = 8;
export const FIRST_BANK_COLUMN = 5; // E
export const BANK_PITCH = 3; // name+balance in one column, type in the next, one spare

export const COL = {
  formulaToPay: 1, // A
  name: 2, // B
  status: 3, // C
  projected: 4, // D
  start: 5, // E
  end: 6, // F
  paid: 7, // G
  interest: 8, // H
  notes: 9, // I
  due: 10, // J
  scheduled: 11, // K
  kind: 12, // L
  tag: 13, // M
  linkedTo: 14, // N
  account: 15, // O
  incomeLabel: 17, // Q
  incomeAccount: 18, // R
} as const;

export const ONE_OFF = "One-off";
