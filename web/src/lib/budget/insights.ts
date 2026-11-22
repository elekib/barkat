import { shiftYm } from "./months";
import { isAdjustment, yearInputs } from "./year";
import type { MonthInput } from "./trend";
import type { Cents } from "./types";

/**
 * Insights from the books' own history, by plain statistics: no model, nothing leaves the machine.
 * Everything here is pure. Adjustment entries are corrections, so they never count as spending.
 */

export interface InsightMonth {
  ym: string;
  income: Cents;
  spending: Cents;
  cushion: Cents;
  /** Planned items (bills and one-offs, not set to None) by lower-cased name, with a display name and amount. */
  items: Map<string, { name: string; amount: Cents }>;
}

export type InsightKind = "bill-change" | "bill-missing" | "bill-new" | "spending-spike" | "overdraw";
export type Severity = "warn" | "info";

export interface Insight {
  kind: InsightKind;
  severity: Severity;
  title: string;
  detail: string;
  /** Month the insight is about. */
  ym: string;
}

export interface ForecastPoint {
  ym: string;
  /** Expected cushion: the latest one plus the typical monthly net for each month ahead. */
  expected: Cents;
  /** Same, using the worst and the best net seen lately. */
  low: Cents;
  high: Cents;
}

export interface InsightReport {
  /** The month the insights are about: the latest with data on or before "now". Null with too little history. */
  latest: string | null;
  /** Months of history the numbers rest on. */
  basis: number;
  /** Typical net (income less spending) of a month, over the recent months. */
  averageNet: Cents | null;
  forecast: ForecastPoint[];
  insights: Insight[];
}

/** Months used for averages, and the fewest needed before a forecast is worth showing. */
export const WINDOW = 6;
export const MIN_FORECAST = 3;
/** A bill must differ from its usual amount by this share and this much money to be called a change. */
export const CHANGE_SHARE = 0.25;
export const CHANGE_MIN: Cents = 500;
/** A bill counts as recurring when it was in at least this many of the 4 months before. */
export const RECURRING_OF_4 = 3;

const key = (name: string) => name.trim().toLowerCase();

/** The months as the insights read them: totals from the year view's rules, plus each month's planned items by name. */
export function insightMonths(months: MonthInput[], sizes: ReadonlyMap<string, number>): InsightMonth[] {
  const totals = new Map(yearInputs(months, sizes).map((m) => [m.ym, m]));
  return [...months]
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .filter((m) => !totals.get(m.ym)!.empty)
    .map((m) => {
      const items = new Map<string, { name: string; amount: Cents }>();
      for (const p of [...m.bills, ...m.adHoc]) {
        if (p.status === "None" || p.projected <= 0 || isAdjustment(p.name) || key(p.name) === "") continue;
        const k = key(p.name);
        const prev = items.get(k);
        items.set(k, { name: prev?.name ?? p.name.trim(), amount: (prev?.amount ?? 0) + p.projected });
      }
      const t = totals.get(m.ym)!;
      return { ym: m.ym, income: t.income, spending: t.spending, cushion: t.cushion, items };
    });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const money = (c: Cents) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Expected cushion for the next `ahead` months, with a low-to-high range from the recent nets. */
export function forecast(recent: InsightMonth[], ahead = 3): ForecastPoint[] {
  if (recent.length < MIN_FORECAST) return [];
  const nets = recent.map((m) => m.income - m.spending);
  const avg = mean(nets);
  const last = recent[recent.length - 1];
  return Array.from({ length: ahead }, (_, i) => ({
    ym: shiftYm(last.ym, i + 1),
    expected: Math.round(last.cushion + avg * (i + 1)),
    low: Math.round(last.cushion + Math.min(...nets) * (i + 1)),
    high: Math.round(last.cushion + Math.max(...nets) * (i + 1)),
  }));
}

/** Insights about the latest month in `history` (oldest first), judged against the months before it. */
export function findInsights(history: InsightMonth[]): Insight[] {
  const latest = history[history.length - 1];
  const before = history.slice(0, -1);
  if (!latest || before.length < 3) return [];
  const out: Insight[] = [];

  // A bill far from its usual amount (the median of up to 6 earlier months it appeared in).
  for (const [k, now] of latest.items) {
    const past = before.slice(-WINDOW).flatMap((m) => (m.items.has(k) ? [m.items.get(k)!.amount] : []));
    if (past.length < 3) continue;
    const usual = median(past);
    const diff = now.amount - usual;
    if (Math.abs(diff) >= CHANGE_MIN && Math.abs(diff) / usual >= CHANGE_SHARE) {
      const pct = Math.round((Math.abs(diff) / usual) * 100);
      out.push({
        kind: "bill-change",
        severity: diff > 0 ? "warn" : "info",
        title: `${now.name} is ${pct}% ${diff > 0 ? "higher" : "lower"} than usual`,
        detail: `${money(now.amount)} this month against a usual ${money(Math.round(usual))}.`,
        ym: latest.ym,
      });
    }
  }

  // A regular bill that has not turned up this month.
  const last4 = before.slice(-4);
  if (last4.length === 4) {
    const seen = new Map<string, { name: string; count: number; amounts: number[] }>();
    for (const m of last4)
      for (const [k, it] of m.items) {
        const s = seen.get(k) ?? { name: it.name, count: 0, amounts: [] };
        s.count++;
        s.amounts.push(it.amount);
        seen.set(k, s);
      }
    for (const [k, s] of seen)
      if (s.count >= RECURRING_OF_4 && !latest.items.has(k))
        out.push({
          kind: "bill-missing",
          severity: "info",
          title: `${s.name} is missing this month`,
          detail: `It was in ${s.count} of the last 4 months, around ${money(Math.round(median(s.amounts)))}. Left out on purpose, or forgotten?`,
          ym: latest.ym,
        });
  }

  // A bill that was never in the earlier months at all.
  const ever = new Set(before.flatMap((m) => [...m.items.keys()]));
  for (const [k, it] of latest.items)
    if (!ever.has(k) && it.amount >= CHANGE_MIN)
      out.push({ kind: "bill-new", severity: "info", title: `New this month: ${it.name}`, detail: `${money(it.amount)}, and not in any earlier month of this book.`, ym: latest.ym });

  // Total spending well above the usual month.
  const spends = before.slice(-WINDOW).map((m) => m.spending);
  if (spends.length >= 4) {
    const avg = mean(spends);
    const sd = stdev(spends);
    if (avg > 0 && latest.spending > avg + 2 * sd && latest.spending > avg * 1.15)
      out.push({
        kind: "spending-spike",
        severity: "warn",
        title: `Spending is ${Math.round((latest.spending / avg - 1) * 100)}% above your usual month`,
        detail: `${money(latest.spending)} planned against an average of ${money(Math.round(avg))} over the last ${spends.length} months.`,
        ym: latest.ym,
      });
  }
  return out;
}

/** Everything for the insights page, from the books' history. `now` is "YYYY-MM"; later months are left out. */
export function insightReport(months: InsightMonth[], now: string): InsightReport {
  const history = months.filter((m) => m.ym <= now);
  const recent = history.slice(-WINDOW);
  const fc = forecast(recent);
  const insights = findInsights(history);
  const last = history[history.length - 1];
  for (const f of fc)
    if (f.expected < 0) {
      insights.push({
        kind: "overdraw",
        severity: "warn",
        title: `Cushion expected to go negative by ${f.ym}`,
        detail: `At your recent pace it reaches ${money(f.expected)}. Worst recent month: ${money(f.low)}.`,
        ym: f.ym,
      });
      break;
    }
  insights.sort((a, b) => Number(b.severity === "warn") - Number(a.severity === "warn"));
  return {
    latest: last?.ym ?? null,
    basis: recent.length,
    averageNet: recent.length >= MIN_FORECAST ? Math.round(mean(recent.map((m) => m.income - m.spending))) : null,
    forecast: fc,
    insights,
  };
}
