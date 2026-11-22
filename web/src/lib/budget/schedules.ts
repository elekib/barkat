/** Recurring income: which paydays fall in a month. Pure, on ISO dates (YYYY-MM-DD). */

export const FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Paydays inside month `ym`, oldest first. `anchor` is any real payday: the
 * rhythm counts from it and never produces a date before it.
 *  - weekly: every 7 days, biweekly: every 14 days
 *  - monthly: the anchor's day of the month, or the last day in shorter months
 */
export function scheduleDates(frequency: Frequency, anchor: string, ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const first = Date.UTC(y, m - 1, 1);
  const next = Date.UTC(y, m, 1);
  const start = utc(anchor);
  if (Number.isNaN(start)) return [];

  if (frequency === "monthly") {
    const wanted = new Date(start).getUTCDate();
    const lastDay = new Date(next - DAY_MS).getUTCDate();
    const date = Date.UTC(y, m - 1, Math.min(wanted, lastDay));
    return date >= start ? [iso(date)] : [];
  }

  const step = (frequency === "weekly" ? 7 : 14) * DAY_MS;
  const k = Math.max(0, Math.ceil((first - start) / step));
  const out: string[] = [];
  for (let t = start + k * step; t < next; t += step) out.push(iso(t));
  return out;
}
