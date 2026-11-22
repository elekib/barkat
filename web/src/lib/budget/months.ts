/** Month helpers on "YYYY-MM" strings. */

export function isYm(value: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export function currentYm(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

const names = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${names[m - 1]} ${y}`;
}

/** First day of the month as an ISO date. */
export function monthStart(ym: string): string {
  return `${ym}-01`;
}

/** The date in month `ym` for a day of the month, held to the month's last day (the 31st in February is the 28th or 29th). */
export function dateInMonth(ym: string, day: number): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(Math.min(Math.max(day, 1), last)).padStart(2, "0")}`;
}

/** The last date of month `ym`. */
export function monthEnd(ym: string): string {
  return dateInMonth(ym, 31);
}
